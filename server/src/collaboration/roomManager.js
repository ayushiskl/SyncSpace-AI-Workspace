import * as Y from 'yjs';
import * as syncProtocol from 'y-protocols/sync';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import { Document } from '../models/Document.js';
import { DocumentSnapshot } from '../models/DocumentSnapshot.js';
import { env } from '../config/env.js';
import { getDocumentPlainText, initializeDocumentContent } from './yjsDocUtils.js';

const MESSAGE_SYNC = 0;
const MESSAGE_AWARENESS = 1;
const MESSAGE_QUERY_AWARENESS = 3;

const WS_READY_STATE_OPEN = 1;

function sendBuffer(ws, uint8Array) {
  if (ws.readyState === WS_READY_STATE_OPEN) {
    ws.send(uint8Array, (err) => {
      if (err) {
        try {
          ws.close();
        } catch {
          // ignore
        }
      }
    });
  }
}

class CollaborationRoom {
  constructor(documentId, manager) {
    this.documentId = documentId;
    this.manager = manager;
    this.doc = new Y.Doc();
    this.awareness = new awarenessProtocol.Awareness(this.doc);
    // Remove server's own default awareness state until AI agent activates
    this.awareness.setLocalState(null);

    this.connections = new Map(); // ws -> { user, controlledClientIds: Set<number> }
    this.version = 0;
    this.dirty = false;
    this.persistTimer = null;
    this.idleTimer = null;
    this.lastActivityAt = Date.now();
    this.lastEditorUserId = null;

    // Broadcast incremental Yjs CRDT updates to all peers in the room
    this.doc.on('update', (update, origin) => {
      this.version += 1;
      this.dirty = true;
      this.lastActivityAt = Date.now();

      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, MESSAGE_SYNC);
      syncProtocol.writeUpdate(encoder, update);
      const message = encoding.toUint8Array(encoder);

      for (const [conn] of this.connections.entries()) {
        if (conn !== origin) {
          sendBuffer(conn, message);
        }
      }

      this.schedulePersistence();
    });

    // Broadcast awareness (live cursors, presence, AI agent status) to all peers
    this.awareness.on('update', ({ added, updated, removed }, origin) => {
      const changedClients = added.concat(updated, removed);
      if (origin && this.connections.has(origin)) {
        const meta = this.connections.get(origin);
        added.forEach((id) => meta.controlledClientIds.add(id));
        removed.forEach((id) => meta.controlledClientIds.delete(id));
      }

      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, MESSAGE_AWARENESS);
      encoding.writeVarUint8Array(
        encoder,
        awarenessProtocol.encodeAwarenessUpdate(this.awareness, changedClients)
      );
      const buff = encoding.toUint8Array(encoder);

      for (const [conn] of this.connections.entries()) {
        sendBuffer(conn, buff);
      }
    });
  }

  async loadFromPersistence() {
    const latestSnapshot = await DocumentSnapshot.findOne({ documentId: this.documentId })
      .sort({ version: -1 })
      .lean();

    if (latestSnapshot && latestSnapshot.snapshotData) {
      const binary = new Uint8Array(
        latestSnapshot.snapshotData.buffer || latestSnapshot.snapshotData
      );
      Y.applyUpdate(this.doc, binary, 'persistence-load');
      this.version = latestSnapshot.version || 1;
      this.dirty = false;
      return;
    }

    // No snapshot yet: initialize clean Tiptap content from document title
    const docRecord = await Document.findById(this.documentId).lean();
    initializeDocumentContent(this.doc, docRecord?.title || 'Untitled Document', true);
    this.version = 1;
    await this.persistNow(docRecord?.ownerId || null);
  }

  addConnection(ws, user) {
    this.cancelIdleCleanup();
    this.lastActivityAt = Date.now();
    this.connections.set(ws, {
      user,
      controlledClientIds: new Set(),
    });

    // Step 1: Send SyncStep1 so client reconciles state vector immediately
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MESSAGE_SYNC);
    syncProtocol.writeSyncStep1(encoder, this.doc);
    sendBuffer(ws, encoding.toUint8Array(encoder));

    // Step 2: Send existing awareness states (other active users + AI agent status)
    const awarenessStates = this.awareness.getStates();
    if (awarenessStates.size > 0) {
      const awarenessEncoder = encoding.createEncoder();
      encoding.writeVarUint(awarenessEncoder, MESSAGE_AWARENESS);
      encoding.writeVarUint8Array(
        awarenessEncoder,
        awarenessProtocol.encodeAwarenessUpdate(
          this.awareness,
          Array.from(awarenessStates.keys())
        )
      );
      sendBuffer(ws, encoding.toUint8Array(awarenessEncoder));
    }

    ws.on('message', (data) => {
      this.handleMessage(ws, data);
    });

    ws.on('close', () => {
      this.removeConnection(ws);
    });

    ws.on('error', () => {
      this.removeConnection(ws);
    });
  }

  handleMessage(ws, rawData) {
    try {
      const meta = this.connections.get(ws);
      const data = rawData instanceof Uint8Array ? rawData : new Uint8Array(rawData);
      const decoder = decoding.createDecoder(data);
      const messageType = decoding.readVarUint(decoder);

      switch (messageType) {
        case MESSAGE_SYNC: {
          // Enforce read-only viewer authorization on incoming document mutations
          const peekType = decoding.peekVarUint(decoder);
          const isMutation = peekType === syncProtocol.messageYjsUpdate || peekType === syncProtocol.messageYjsSyncStep2;
          if (isMutation && meta?.user?.role === 'viewer') {
            return;
          }
          if (isMutation && meta?.user?.id) {
            this.lastEditorUserId = meta.user.id;
          }

          const encoder = encoding.createEncoder();
          encoding.writeVarUint(encoder, MESSAGE_SYNC);
          syncProtocol.readSyncMessage(decoder, encoder, this.doc, ws);
          if (encoding.length(encoder) > 1) {
            sendBuffer(ws, encoding.toUint8Array(encoder));
          }
          break;
        }
        case MESSAGE_AWARENESS: {
          const update = decoding.readVarUint8Array(decoder);
          awarenessProtocol.applyAwarenessUpdate(this.awareness, update, ws);
          break;
        }
        case MESSAGE_QUERY_AWARENESS: {
          const encoder = encoding.createEncoder();
          encoding.writeVarUint(encoder, MESSAGE_AWARENESS);
          encoding.writeVarUint8Array(
            encoder,
            awarenessProtocol.encodeAwarenessUpdate(
              this.awareness,
              Array.from(this.awareness.getStates().keys())
            )
          );
          sendBuffer(ws, encoding.toUint8Array(encoder));
          break;
        }
        default:
          break;
      }
    } catch (err) {
      console.error(`[Room ${this.documentId}] Message decode error:`, err.message);
    }
  }

  removeConnection(ws) {
    const meta = this.connections.get(ws);
    if (!meta) return;

    this.connections.delete(ws);

    if (meta.controlledClientIds.size > 0) {
      awarenessProtocol.removeAwarenessStates(
        this.awareness,
        Array.from(meta.controlledClientIds),
        null
      );
    }

    if (this.connections.size === 0) {
      this.persistNow(this.lastEditorUserId).catch((err) => {
        console.error(`[Room ${this.documentId}] Final persist failed:`, err.message);
      });
      this.scheduleIdleCleanup();
    }
  }

  /**
   * Broadcast live AI agent status via Yjs Awareness protocol so all editors
   * immediately see when Writing Assistant is analyzing or editing a section.
   */
  setAIAgentPresence(activity) {
    if (!activity) {
      this.awareness.setLocalState(null);
      return;
    }
    this.awareness.setLocalState({
      user: {
        id: 'ai-writing-assistant',
        name: activity.agentName || 'Writing Assistant (AI)',
        color: '#7C3AED',
        isAI: true,
        status: activity.status || 'Processing',
        targetLabel: activity.targetLabel || '',
        instruction: activity.instruction || '',
      },
    });
  }

  getActiveUsers() {
    const seen = new Map();
    for (const { user } of this.connections.values()) {
      if (user && user.id && !seen.has(user.id)) {
        seen.set(user.id, {
          id: user.id,
          name: user.name,
          email: user.email,
          color: user.cursorColor,
          role: user.role,
        });
      }
    }
    return Array.from(seen.values());
  }

  schedulePersistence() {
    if (this.persistTimer) clearTimeout(this.persistTimer);
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      if (this.dirty) {
        this.persistNow(this.lastEditorUserId).catch((err) => {
          console.error(`[Room ${this.documentId}] Debounced persist error:`, err.message);
        });
      }
    }, env.snapshotDebounceMs);
  }

  async persistNow(userId = null) {
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
      this.persistTimer = null;
    }

    const stateUpdate = Buffer.from(Y.encodeStateAsUpdate(this.doc));
    const stateVector = Buffer.from(Y.encodeStateVector(this.doc));
    const plainText = getDocumentPlainText(this.doc);
    const nextVersion = Math.max(this.version, 1);

    const snapshot = await DocumentSnapshot.create({
      documentId: this.documentId,
      snapshotData: stateUpdate,
      stateVector,
      version: nextVersion,
      plainTextPreview: plainText.slice(0, 1000),
      createdBy: userId || this.lastEditorUserId || null,
    });

    // Keep latest 30 snapshots per document to prevent unbounded DB growth in MVP
    const oldSnapshots = await DocumentSnapshot.find({ documentId: this.documentId })
      .sort({ version: -1, createdAt: -1 })
      .skip(30)
      .select('_id')
      .lean();
    if (oldSnapshots.length > 0) {
      await DocumentSnapshot.deleteMany({ _id: { $in: oldSnapshots.map((s) => s._id) } });
    }

    await Document.findByIdAndUpdate(this.documentId, {
      currentVersion: nextVersion,
      excerpt: plainText.slice(0, 260),
      ...(userId || this.lastEditorUserId ? { lastEditedBy: userId || this.lastEditorUserId } : {}),
    });

    this.dirty = false;
    return snapshot;
  }

  scheduleIdleCleanup() {
    this.cancelIdleCleanup();
    this.idleTimer = setTimeout(() => {
      if (this.connections.size === 0) {
        this.manager.unloadRoom(this.documentId);
      }
    }, env.roomIdleTimeoutMs);
  }

  cancelIdleCleanup() {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
  }

  destroy() {
    this.cancelIdleCleanup();
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
      this.persistTimer = null;
    }
    for (const [ws] of this.connections.entries()) {
      try {
        ws.close(1001, 'Room closed');
      } catch {
        // ignore
      }
    }
    this.connections.clear();
    this.awareness.destroy();
    this.doc.destroy();
  }
}

export class RoomManager {
  constructor() {
    this.rooms = new Map(); // documentId -> CollaborationRoom
    this.loadingPromises = new Map(); // prevent duplicate concurrent loads
  }

  async getOrCreateRoom(documentId) {
    const id = documentId.toString();
    if (this.rooms.has(id)) {
      const existing = this.rooms.get(id);
      existing.cancelIdleCleanup();
      return existing;
    }

    if (this.loadingPromises.has(id)) {
      return this.loadingPromises.get(id);
    }

    const loadPromise = (async () => {
      const room = new CollaborationRoom(id, this);
      await room.loadFromPersistence();
      this.rooms.set(id, room);
      return room;
    })();

    this.loadingPromises.set(id, loadPromise);
    try {
      return await loadPromise;
    } finally {
      this.loadingPromises.delete(id);
    }
  }

  getRoomIfLoaded(documentId) {
    return this.rooms.get(documentId.toString()) || null;
  }

  getActiveUsersForDocument(documentId) {
    const room = this.rooms.get(documentId.toString());
    return room ? room.getActiveUsers() : [];
  }

  async unloadRoom(documentId) {
    const id = documentId.toString();
    const room = this.rooms.get(id);
    if (!room) return;
    if (room.dirty) {
      try {
        await room.persistNow();
      } catch (err) {
        console.error(`[RoomManager] Error persisting room ${id} during unload:`, err.message);
      }
    }
    this.rooms.delete(id);
    room.destroy();
  }

  async persistAndShutdownAll() {
    const ids = Array.from(this.rooms.keys());
    for (const id of ids) {
      await this.unloadRoom(id);
    }
  }
}

export const roomManager = new RoomManager();
