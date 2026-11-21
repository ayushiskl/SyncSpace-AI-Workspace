import http from 'http';
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import WebSocket from 'ws';
import * as Y from 'yjs';
import * as syncProtocol from 'y-protocols/sync';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';

import { createApp } from '../../server/src/app.js';
import { connectDB, disconnectDB } from '../../server/src/config/db.js';
import { attachYjsWebSocketServer } from '../../server/src/sockets/yjsWebSocketServer.js';
import { roomManager } from '../../server/src/collaboration/roomManager.js';
import { setAIProviderForTesting } from '../../server/src/ai/geminiService.js';
import { getDocumentPlainText, extractBlocks } from '../../server/src/collaboration/yjsDocUtils.js';

async function apiRequest(baseUrl, method, route, { token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${baseUrl}${route}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, body: data };
}

const MESSAGE_SYNC = 0;
const MESSAGE_AWARENESS = 1;

/**
 * Lightweight Yjs WebSocket test client using the exact y-websocket wire protocol.
 */
function createTestYjsClient(wsUrl, userInfo) {
  return new Promise((resolve, reject) => {
    const doc = new Y.Doc();
    const awareness = new awarenessProtocol.Awareness(doc);
    awareness.setLocalStateField('user', userInfo);

    const ws = new WebSocket(wsUrl);
    let synced = false;
    let settled = false;

    const send = (uint8) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(uint8);
      }
    };

    doc.on('update', (update, origin) => {
      if (origin === 'remote') return;
      const enc = encoding.createEncoder();
      encoding.writeVarUint(enc, MESSAGE_SYNC);
      syncProtocol.writeUpdate(enc, update);
      send(encoding.toUint8Array(enc));
    });

    awareness.on('update', ({ added, updated, removed }, origin) => {
      if (origin === 'remote') return;
      const changed = added.concat(updated, removed);
      const enc = encoding.createEncoder();
      encoding.writeVarUint(enc, MESSAGE_AWARENESS);
      encoding.writeVarUint8Array(enc, awarenessProtocol.encodeAwarenessUpdate(awareness, changed));
      send(encoding.toUint8Array(enc));
    });

    ws.on('open', () => {
      const enc = encoding.createEncoder();
      encoding.writeVarUint(enc, MESSAGE_SYNC);
      syncProtocol.writeSyncStep1(enc, doc);
      send(encoding.toUint8Array(enc));

      const awEnc = encoding.createEncoder();
      encoding.writeVarUint(awEnc, MESSAGE_AWARENESS);
      encoding.writeVarUint8Array(
        awEnc,
        awarenessProtocol.encodeAwarenessUpdate(awareness, [doc.clientID])
      );
      send(encoding.toUint8Array(awEnc));
    });

    ws.on('message', (raw) => {
      const data = new Uint8Array(raw);
      const dec = decoding.createDecoder(data);
      const msgType = decoding.readVarUint(dec);

      if (msgType === MESSAGE_SYNC) {
        const enc = encoding.createEncoder();
        encoding.writeVarUint(enc, MESSAGE_SYNC);
        const syncType = syncProtocol.readSyncMessage(dec, enc, doc, 'remote');
        if (encoding.length(enc) > 1) {
          send(encoding.toUint8Array(enc));
        }
        if (syncType === syncProtocol.messageYjsSyncStep2 && !synced) {
          synced = true;
          if (!settled) {
            settled = true;
            resolve({
              doc,
              awareness,
              ws,
              close: () =>
                new Promise((done) => {
                  ws.once('close', done);
                  ws.close();
                  awareness.destroy();
                  doc.destroy();
                }),
            });
          }
        }
      } else if (msgType === MESSAGE_AWARENESS) {
        awarenessProtocol.applyAwarenessUpdate(
          awareness,
          decoding.readVarUint8Array(dec),
          'remote'
        );
      }
    });

    ws.on('error', (err) => {
      if (!settled) {
        settled = true;
        reject(err);
      }
    });

    ws.on('unexpected-response', (_req, res) => {
      if (!settled) {
        settled = true;
        reject(new Error(`WS_REJECTED_${res.statusCode}`));
      }
    });
  });
}

function waitMs(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitForCondition(predicate, timeoutMs = 4000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (predicate()) return true;
    await waitMs(25);
  }
  return false;
}

describe('End-to-End Real-Time Collaboration & Concurrent Human + AI Editing', () => {
  let mongoServer;
  let httpServer;
  let baseUrl;
  let wsBaseUrl;
  let userA;
  let userB;
  let userC;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await connectDB(mongoServer.getUri());

    const app = createApp();
    httpServer = http.createServer(app);
    attachYjsWebSocketServer(httpServer);

    await new Promise((resolve) => {
      httpServer.listen(0, '127.0.0.1', resolve);
    });

    const { port } = httpServer.address();
    baseUrl = `http://127.0.0.1:${port}`;
    wsBaseUrl = `ws://127.0.0.1:${port}/yjs`;

    // Register 3 users: Alice (owner), Bob (collaborator), Charlie (unauthorized)
    const regA = await apiRequest(baseUrl, 'POST', '/api/auth/register', {
      body: { name: 'Alice', email: 'alice@syncspace.test', password: 'password123' },
    });
    expect(regA.status).toBe(201);
    userA = { token: regA.body.token, ...regA.body.user };

    const regB = await apiRequest(baseUrl, 'POST', '/api/auth/register', {
      body: { name: 'Bob', email: 'bob@syncspace.test', password: 'password123' },
    });
    expect(regB.status).toBe(201);
    userB = { token: regB.body.token, ...regB.body.user };

    const regC = await apiRequest(baseUrl, 'POST', '/api/auth/register', {
      body: { name: 'Charlie', email: 'charlie@syncspace.test', password: 'password123' },
    });
    expect(regC.status).toBe(201);
    userC = { token: regC.body.token, ...regC.body.user };
  });

  afterEach(() => {
    setAIProviderForTesting(null);
  });

  afterAll(async () => {
    await roomManager.persistAndShutdownAll();
    if (httpServer) await new Promise((resolve) => httpServer.close(resolve));
    await disconnectDB();
    if (mongoServer) await mongoServer.stop();
  });

  it('enforces auth & authorization on REST and WebSocket rooms, syncs 2 clients + cursors, and survives room restart', async () => {
    // 1. Alice creates a document
    const createRes = await apiRequest(baseUrl, 'POST', '/api/documents', {
      token: userA.token,
      body: { title: 'Realtime Sync Spec', seedTemplate: true },
    });
    expect(createRes.status).toBe(201);
    const docId = createRes.body.document.id;

    // 2. Unauthorized Charlie is blocked on both REST and WebSocket
    const forbiddenRest = await apiRequest(baseUrl, 'GET', `/api/documents/${docId}`, {
      token: userC.token,
    });
    expect(forbiddenRest.status).toBe(403);

    await expect(
      createTestYjsClient(`${wsBaseUrl}/${docId}?token=${userC.token}`, {
        id: userC.id,
        name: 'Charlie',
        color: '#DC2626',
      })
    ).rejects.toThrow('WS_REJECTED_403');

    // 3. Alice shares document with Bob as editor
    const shareRes = await apiRequest(baseUrl, 'PATCH', `/api/documents/${docId}`, {
      token: userA.token,
      body: { addCollaboratorEmail: userB.email, collaboratorRole: 'editor' },
    });
    expect(shareRes.status).toBe(200);

    // 4. Both Alice and Bob connect via WebSocket
    const clientA = await createTestYjsClient(`${wsBaseUrl}/${docId}?token=${userA.token}`, {
      id: userA.id,
      name: 'Alice',
      color: '#2563EB',
    });
    const clientB = await createTestYjsClient(`${wsBaseUrl}/${docId}?token=${userB.token}`, {
      id: userB.id,
      name: 'Bob',
      color: '#059669',
    });

    // Live awareness/presence check
    const sawRemoteCursor = await waitForCondition(() => clientA.awareness.getStates().size >= 2);
    expect(sawRemoteCursor).toBe(true);

    // 5. Simultaneous human editing -> both converge identically
    const sec1A = extractBlocks(clientA.doc)[3].xmlText;
    const sec2B = extractBlocks(clientB.doc)[5].xmlText;

    clientA.doc.transact(() => {
      sec1A.insert(sec1A.length, ' [Alice live edit]');
    });
    clientB.doc.transact(() => {
      sec2B.insert(sec2B.length, ' [Bob live edit]');
    });

    const converged = await waitForCondition(
      () =>
        getDocumentPlainText(clientA.doc).includes('[Bob live edit]') &&
        getDocumentPlainText(clientB.doc).includes('[Alice live edit]')
    );
    expect(converged).toBe(true);
    expect(getDocumentPlainText(clientA.doc)).toBe(getDocumentPlainText(clientB.doc));

    const savedTextBeforeRestart = getDocumentPlainText(clientA.doc);

    // 6. Persist & simulate server restart (unload live Y.Doc from memory completely)
    const snapRes = await apiRequest(baseUrl, 'POST', `/api/documents/${docId}/snapshot`, {
      token: userA.token,
    });
    expect(snapRes.status).toBe(201);

    await clientA.close();
    await clientB.close();
    await roomManager.unloadRoom(docId);
    expect(roomManager.getRoomIfLoaded(docId)).toBeNull();

    // 7. Reconnect after server restart -> recovers exact persisted CRDT state!
    const clientA2 = await createTestYjsClient(`${wsBaseUrl}/${docId}?token=${userA.token}`, {
      id: userA.id,
      name: 'Alice',
      color: '#2563EB',
    });
    expect(getDocumentPlainText(clientA2.doc)).toBe(savedTextBeforeRestart);
    await clientA2.close();
  });

  it('CRITICAL SCENARIO: protects concurrent human edits when AI rewrites Section 3 from an older snapshot (both safe-merge and conflict-review paths)', async () => {
    // Setup shared document between Alice and Bob
    const createRes = await apiRequest(baseUrl, 'POST', '/api/documents', {
      token: userA.token,
      body: { title: 'AI Concurrency Spec', seedTemplate: true },
    });
    const docId = createRes.body.document.id;

    await apiRequest(baseUrl, 'PATCH', `/api/documents/${docId}`, {
      token: userA.token,
      body: { addCollaboratorEmail: userB.email, collaboratorRole: 'editor' },
    });

    const clientA = await createTestYjsClient(`${wsBaseUrl}/${docId}?token=${userA.token}`, {
      id: userA.id,
      name: 'Alice',
      color: '#2563EB',
    });
    const clientB = await createTestYjsClient(`${wsBaseUrl}/${docId}?token=${userB.token}`, {
      id: userB.id,
      name: 'Bob',
      color: '#059669',
    });

    // -------------------------------------------------------------------------
    // PART A: Non-overlapping concurrent edit in Section 3 -> Auto Safe Merge!
    // -------------------------------------------------------------------------
    let resolveAIWindow1;
    const aiStarted1 = new Promise((res) => {
      setAIProviderForTesting(async ({ originalContent }) => {
        res(originalContent);
        // Hold AI response open while Bob edits Section 3 concurrently!
        await new Promise((r) => {
          resolveAIWindow1 = r;
        });
        return {
          proposedContent: originalContent.replace(
            'When a user asks the Writing Assistant to rewrite this section',
            'When any collaborator instructs the Writing Assistant to refine Section 3'
          ),
          explanation: 'Clarified opening clause of Section 3.',
        };
      });
    });

    // Alice triggers AI rewrite of Section 3
    const aiRequestPromise1 = apiRequest(baseUrl, 'POST', '/api/ai/rewrite', {
      token: userA.token,
      body: {
        documentId: docId,
        instruction: 'Rewrite section 3 to be clearer',
      },
    });

    // Wait until AI has captured the base snapshot and is actively processing
    await aiStarted1;

    // While AI is processing, Bob concurrently appends a critical note to Section 3!
    const sec3BlockB = extractBlocks(clientB.doc)[7].xmlText;
    clientB.doc.transact(() => {
      sec3BlockB.insert(sec3BlockB.length, ' BOB_CRITICAL_CONCURRENT_EDIT.');
    });

    // Wait for Bob's edit to reach the server room
    await waitForCondition(() =>
      getDocumentPlainText(roomManager.getRoomIfLoaded(docId).doc).includes(
        'BOB_CRITICAL_CONCURRENT_EDIT.'
      )
    );

    // Now release the AI response (generated from the OLDER base version!)
    resolveAIWindow1();
    const aiRes1 = await aiRequestPromise1;
    expect(aiRes1.status).toBe(201);

    const exec1 = aiRes1.body.execution;
    expect(exec1.status).toBe('Completed');
    expect(exec1.mergeAnalysis.concurrentHumanEditsDetected).toBe(true);
    expect(exec1.mergeAnalysis.hasConflict).toBe(false);
    expect(exec1.mergeAnalysis.mergeStrategy).toBe('three-way-safe-merge');
    expect(exec1.safeMergedContent).toContain('BOB_CRITICAL_CONCURRENT_EDIT.');
    expect(exec1.safeMergedContent).toContain('When any collaborator instructs the Writing Assistant');

    // Apply safe merge -> broadcasts minimal Yjs diff to both Alice and Bob!
    const applyRes1 = await apiRequest(baseUrl, 'POST', `/api/ai/executions/${exec1._id}/apply`, {
      token: userA.token,
      body: { mode: 'apply_safe' },
    });
    expect(applyRes1.status).toBe(200);

    // Verify BOTH Alice and Bob converge to identical document containing BOTH Bob's edit AND AI's edit!
    const syncedPartA = await waitForCondition(
      () =>
        getDocumentPlainText(clientA.doc).includes('When any collaborator instructs') &&
        getDocumentPlainText(clientB.doc).includes('When any collaborator instructs')
    );
    expect(syncedPartA).toBe(true);
    expect(getDocumentPlainText(clientA.doc)).toBe(getDocumentPlainText(clientB.doc));
    expect(getDocumentPlainText(clientA.doc)).toContain('BOB_CRITICAL_CONCURRENT_EDIT.');

    // -------------------------------------------------------------------------
    // PART B: Overlapping concurrent edit in Section 3 -> Conflict Review Required!
    // -------------------------------------------------------------------------
    let resolveAIWindow2;
    const aiStarted2 = new Promise((res) => {
      setAIProviderForTesting(async ({ originalContent }) => {
        res(originalContent);
        await new Promise((r) => {
          resolveAIWindow2 = r;
        });
        return {
          // AI rewrites the ENTIRE paragraph from the older snapshot
          proposedContent:
            'Completely rewritten Section 3 text generated by AI from the older snapshot.',
          explanation: 'Full section rewrite.',
        };
      });
    });

    const aiRequestPromise2 = apiRequest(baseUrl, 'POST', '/api/ai/rewrite', {
      token: userA.token,
      body: {
        documentId: docId,
        instruction: 'Rewrite section 3 completely',
      },
    });

    await aiStarted2;

    // Bob edits the SAME middle text that the AI is trying to overwrite
    const sec3BlockB2 = extractBlocks(clientB.doc)[7].xmlText;
    clientB.doc.transact(() => {
      sec3BlockB2.insert(0, 'HUMAN_PRIORITY_STATEMENT: ');
    });

    await waitForCondition(() =>
      getDocumentPlainText(roomManager.getRoomIfLoaded(docId).doc).includes(
        'HUMAN_PRIORITY_STATEMENT:'
      )
    );

    resolveAIWindow2();
    const aiRes2 = await aiRequestPromise2;
    expect(aiRes2.status).toBe(201);

    const exec2 = aiRes2.body.execution;
    // System MUST flag Conflict and MUST NOT overwrite Bob's newer text!
    expect(exec2.status).toBe('Conflict');
    expect(exec2.mergeAnalysis.hasConflict).toBe(true);
    expect(exec2.mergeAnalysis.conflicts.length).toBeGreaterThan(0);

    // Blind `apply_safe` MUST be blocked with HTTP 409!
    const blockedApply = await apiRequest(baseUrl, 'POST', `/api/ai/executions/${exec2._id}/apply`, {
      token: userA.token,
      body: { mode: 'apply_safe' },
    });
    expect(blockedApply.status).toBe(409);
    expect(blockedApply.body.code).toBe('CONCURRENT_EDIT_CONFLICT');

    // Bob's human edit is STILL 100% intact in the live document!
    expect(getDocumentPlainText(clientA.doc)).toContain('HUMAN_PRIORITY_STATEMENT:');

    // Human reviews the conflict and approves a custom merged resolution
    const humanReviewedMerge =
      'HUMAN_PRIORITY_STATEMENT: Completely rewritten Section 3 text approved alongside Bob edit.';
    const resolvedApply = await apiRequest(
      baseUrl,
      'POST',
      `/api/ai/executions/${exec2._id}/apply`,
      {
        token: userA.token,
        body: { mode: 'accept_merged', customContent: humanReviewedMerge },
      }
    );
    expect(resolvedApply.status).toBe(200);

    // Both Alice and Bob converge to the exact resolved state
    const syncedPartB = await waitForCondition(
      () =>
        getDocumentPlainText(clientA.doc).includes(humanReviewedMerge) &&
        getDocumentPlainText(clientB.doc).includes(humanReviewedMerge)
    );
    expect(syncedPartB).toBe(true);
    expect(getDocumentPlainText(clientA.doc)).toBe(getDocumentPlainText(clientB.doc));

    await clientA.close();
    await clientB.close();
  });
});
