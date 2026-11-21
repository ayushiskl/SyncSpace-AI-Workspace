import * as Y from 'yjs';
import { Document } from '../models/Document.js';
import { DocumentSnapshot } from '../models/DocumentSnapshot.js';
import { AgentExecution } from '../models/AgentExecution.js';
import { Activity } from '../models/Activity.js';
import { User } from '../models/User.js';
import { roomManager } from '../collaboration/roomManager.js';
import {
  extractSections,
  getDocumentPlainText,
  initializeDocumentContent,
} from '../collaboration/yjsDocUtils.js';
import { logActivity } from '../services/activityService.js';

function formatDocument(doc, userId) {
  const plain = doc.toObject ? doc.toObject() : doc;
  const activeUsers = roomManager.getActiveUsersForDocument(plain._id);
  const role = doc.getUserRole ? doc.getUserRole(userId) : 'editor';

  return {
    id: plain._id.toString(),
    _id: plain._id.toString(),
    title: plain.title,
    ownerId: plain.ownerId,
    collaborators: plain.collaborators || [],
    permissions: plain.permissions || { publicAccess: 'none', allowAI: true },
    lastEditedBy: plain.lastEditedBy || null,
    excerpt: plain.excerpt || '',
    currentVersion: plain.currentVersion || 0,
    activeUsers,
    userRole: role,
    createdAt: plain.createdAt,
    updatedAt: plain.updatedAt,
  };
}

export async function createDocument(req, res, next) {
  try {
    const title = String(req.body?.title || 'Untitled Document').trim() || 'Untitled Document';
    const seedTemplate = req.body?.seedTemplate !== false;

    const doc = await Document.create({
      title,
      ownerId: req.user._id,
      lastEditedBy: req.user._id,
      permissions: {
        publicAccess: req.body?.publicAccess || 'none',
        allowAI: true,
      },
    });

    // Initialize clean Yjs document state and save initial durable snapshot
    const ydoc = new Y.Doc();
    initializeDocumentContent(ydoc, title, seedTemplate);
    const snapshotData = Buffer.from(Y.encodeStateAsUpdate(ydoc));
    const stateVector = Buffer.from(Y.encodeStateVector(ydoc));
    const plainText = getDocumentPlainText(ydoc);
    ydoc.destroy();

    await DocumentSnapshot.create({
      documentId: doc._id,
      snapshotData,
      stateVector,
      version: 1,
      plainTextPreview: plainText.slice(0, 1000),
      createdBy: req.user._id,
    });

    doc.currentVersion = 1;
    doc.excerpt = plainText.slice(0, 260);
    await doc.save();

    await logActivity({
      documentId: doc._id,
      userId: req.user._id,
      action: 'document_created',
      description: `${req.user.name} created "${title}"`,
    });

    const populated = await Document.findById(doc._id)
      .populate('ownerId', 'name email avatar cursorColor')
      .populate('collaborators.userId', 'name email avatar cursorColor')
      .populate('lastEditedBy', 'name email avatar cursorColor');

    res.status(201).json({
      success: true,
      document: formatDocument(populated, req.user._id),
    });
  } catch (err) {
    next(err);
  }
}

export async function listDocuments(req, res, next) {
  try {
    const { search = '', filter = 'all' } = req.query;
    const uid = req.user._id;

    let accessQuery;
    if (filter === 'mine') {
      accessQuery = { ownerId: uid };
    } else if (filter === 'shared') {
      accessQuery = {
        ownerId: { $ne: uid },
        $or: [
          { 'collaborators.userId': uid },
          { 'permissions.publicAccess': { $in: ['view', 'edit'] } },
        ],
      };
    } else {
      accessQuery = {
        $or: [
          { ownerId: uid },
          { 'collaborators.userId': uid },
          { 'permissions.publicAccess': { $in: ['view', 'edit'] } },
        ],
      };
    }

    const query = search.trim()
      ? {
          $and: [
            accessQuery,
            {
              $or: [
                { title: { $regex: search.trim(), $options: 'i' } },
                { excerpt: { $regex: search.trim(), $options: 'i' } },
              ],
            },
          ],
        }
      : accessQuery;

    const docs = await Document.find(query)
      .sort({ updatedAt: -1 })
      .populate('ownerId', 'name email avatar cursorColor')
      .populate('collaborators.userId', 'name email avatar cursorColor')
      .populate('lastEditedBy', 'name email avatar cursorColor');

    res.json({
      success: true,
      documents: docs.map((d) => formatDocument(d, uid)),
    });
  } catch (err) {
    next(err);
  }
}

export async function getDocumentById(req, res, next) {
  try {
    const populated = await Document.findById(req.document._id)
      .populate('ownerId', 'name email avatar cursorColor')
      .populate('collaborators.userId', 'name email avatar cursorColor')
      .populate('lastEditedBy', 'name email avatar cursorColor');

    res.json({
      success: true,
      document: formatDocument(populated, req.user._id),
    });
  } catch (err) {
    next(err);
  }
}

export async function updateDocument(req, res, next) {
  try {
    const doc = req.document;
    const { title, permissions, addCollaboratorEmail, collaboratorRole = 'editor', removeCollaboratorId } =
      req.body || {};

    if (typeof title === 'string' && title.trim().length > 0) {
      const oldTitle = doc.title;
      doc.title = title.trim();
      doc.lastEditedBy = req.user._id;
      if (oldTitle !== doc.title) {
        await logActivity({
          documentId: doc._id,
          userId: req.user._id,
          action: 'document_renamed',
          description: `${req.user.name} renamed document to "${doc.title}"`,
        });
      }
    }

    if (permissions && req.documentRole === 'owner') {
      if (['none', 'view', 'edit'].includes(permissions.publicAccess)) {
        doc.permissions.publicAccess = permissions.publicAccess;
      }
      if (typeof permissions.allowAI === 'boolean') {
        doc.permissions.allowAI = permissions.allowAI;
      }
      await logActivity({
        documentId: doc._id,
        userId: req.user._id,
        action: 'permissions_updated',
        description: `${req.user.name} updated sharing permissions (link access: ${doc.permissions.publicAccess})`,
      });
    }

    if (addCollaboratorEmail) {
      if (req.documentRole !== 'owner') {
        return res.status(403).json({
          success: false,
          message: 'Only the document owner can invite collaborators.',
        });
      }
      const targetUser = await User.findOne({
        email: String(addCollaboratorEmail).trim().toLowerCase(),
      });
      if (!targetUser) {
        return res.status(404).json({
          success: false,
          message: `No user found with email "${addCollaboratorEmail}". Ask them to register first.`,
        });
      }
      if (targetUser._id.toString() === doc.ownerId.toString()) {
        return res.status(400).json({
          success: false,
          message: 'This user is already the document owner.',
        });
      }

      const existingIdx = doc.collaborators.findIndex(
        (c) => c.userId.toString() === targetUser._id.toString()
      );
      const validRole = collaboratorRole === 'viewer' ? 'viewer' : 'editor';

      if (existingIdx >= 0) {
        doc.collaborators[existingIdx].role = validRole;
      } else {
        doc.collaborators.push({ userId: targetUser._id, role: validRole });
      }

      await logActivity({
        documentId: doc._id,
        userId: req.user._id,
        action: 'collaborator_added',
        description: `${req.user.name} added ${targetUser.name} (${validRole})`,
      });
    }

    if (removeCollaboratorId) {
      if (req.documentRole !== 'owner') {
        return res.status(403).json({
          success: false,
          message: 'Only the document owner can remove collaborators.',
        });
      }
      doc.collaborators = doc.collaborators.filter(
        (c) => c.userId.toString() !== String(removeCollaboratorId)
      );
      await logActivity({
        documentId: doc._id,
        userId: req.user._id,
        action: 'collaborator_removed',
        description: `${req.user.name} removed a collaborator`,
      });
    }

    await doc.save();

    const populated = await Document.findById(doc._id)
      .populate('ownerId', 'name email avatar cursorColor')
      .populate('collaborators.userId', 'name email avatar cursorColor')
      .populate('lastEditedBy', 'name email avatar cursorColor');

    res.json({
      success: true,
      document: formatDocument(populated, req.user._id),
    });
  } catch (err) {
    next(err);
  }
}

export async function deleteDocument(req, res, next) {
  try {
    const docId = req.document._id;

    // Unload live collaboration room cleanly
    const liveRoom = roomManager.getRoomIfLoaded(docId);
    if (liveRoom) {
      liveRoom.dirty = false; // no need to persist deleted doc
      await roomManager.unloadRoom(docId);
    }

    await Promise.all([
      Document.findByIdAndDelete(docId),
      DocumentSnapshot.deleteMany({ documentId: docId }),
      AgentExecution.deleteMany({ documentId: docId }),
      Activity.deleteMany({ documentId: docId }),
    ]);

    res.json({
      success: true,
      message: 'Document deleted successfully.',
    });
  } catch (err) {
    next(err);
  }
}

export async function getDocumentSnapshot(req, res, next) {
  try {
    const docId = req.document._id;
    const room = await roomManager.getOrCreateRoom(docId);

    const stateUpdate = Buffer.from(Y.encodeStateAsUpdate(room.doc));
    const sections = extractSections(room.doc).map((s) => ({
      sectionIndex: s.sectionIndex,
      headingText: s.headingText,
      headingLevel: s.headingLevel,
      blockIndices: s.blockIndices,
      preview: s.text.slice(0, 140),
    }));

    const latestRecord = await DocumentSnapshot.findOne({ documentId: docId })
      .sort({ version: -1, createdAt: -1 })
      .select('version createdAt plainTextPreview')
      .lean();

    res.json({
      success: true,
      snapshot: {
        documentId: docId.toString(),
        version: room.version,
        lastSavedAt: latestRecord?.createdAt || req.document.updatedAt,
        snapshotDataBase64: stateUpdate.toString('base64'),
        plainText: getDocumentPlainText(room.doc),
        sections,
        activeUsers: room.getActiveUsers(),
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function saveDocumentSnapshot(req, res, next) {
  try {
    const docId = req.document._id;
    const room = await roomManager.getOrCreateRoom(docId);
    const snapshot = await room.persistNow(req.user._id);

    await logActivity({
      documentId: docId,
      userId: req.user._id,
      action: 'snapshot_saved',
      description: `${req.user.name} saved snapshot v${snapshot.version}`,
      metadata: { version: snapshot.version },
    });

    res.status(201).json({
      success: true,
      snapshot: {
        id: snapshot._id.toString(),
        documentId: docId.toString(),
        version: snapshot.version,
        createdAt: snapshot.createdAt,
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function getDocumentActivity(req, res, next) {
  try {
    const activities = await Activity.find({ documentId: req.document._id })
      .sort({ timestamp: -1 })
      .limit(50)
      .populate('userId', 'name email avatar cursorColor')
      .lean();

    res.json({
      success: true,
      activities: activities.map((a) => ({
        id: a._id.toString(),
        action: a.action,
        description: a.description,
        metadata: a.metadata || {},
        user: a.userId || null,
        timestamp: a.timestamp,
      })),
    });
  } catch (err) {
    next(err);
  }
}
