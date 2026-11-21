import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { User } from '../models/User.js';
import { Document } from '../models/Document.js';

export function signToken(userId) {
  return jwt.sign({ id: userId.toString() }, env.jwtSecret, {
    expiresIn: env.jwtExpiresIn,
  });
}

export async function protect(req, res, next) {
  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required. Please log in.',
      });
    }

    const decoded = jwt.verify(token, env.jwtSecret);
    const user = await User.findById(decoded.id);
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'User account no longer exists.',
      });
    }

    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({
      success: false,
      message: 'Invalid or expired authentication token.',
    });
  }
}

/**
 * Authorize access to a document identified by req.params[paramName] or req.body.documentId.
 * @param {'view'|'edit'|'owner'} requiredLevel
 */
export function requireDocumentAccess(requiredLevel = 'view', paramName = 'id') {
  return async (req, res, next) => {
    try {
      const docId = req.params[paramName] || req.body?.documentId;
      if (!docId || !mongoose.Types.ObjectId.isValid(docId)) {
        return res.status(400).json({
          success: false,
          message: 'Valid document ID is required.',
        });
      }

      const document = await Document.findById(docId);
      if (!document) {
        return res.status(404).json({
          success: false,
          message: 'Document not found.',
        });
      }

      const role = document.getUserRole(req.user._id);
      if (!role) {
        return res.status(403).json({
          success: false,
          message: 'You do not have permission to access this document.',
        });
      }

      if (requiredLevel === 'edit' && role !== 'owner' && role !== 'editor') {
        return res.status(403).json({
          success: false,
          message: 'Editor permission is required for this action.',
        });
      }

      if (requiredLevel === 'owner' && role !== 'owner') {
        return res.status(403).json({
          success: false,
          message: 'Only the document owner can perform this action.',
        });
      }

      req.document = document;
      req.documentRole = role;
      next();
    } catch (err) {
      next(err);
    }
  };
}
