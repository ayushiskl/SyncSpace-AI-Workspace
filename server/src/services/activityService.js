import { Activity } from '../models/Activity.js';

export async function logActivity({ documentId, userId = null, action, description, metadata = {} }) {
  try {
    return await Activity.create({
      documentId,
      userId,
      action,
      description,
      metadata,
    });
  } catch (err) {
    console.error('[ActivityService] Failed to log activity:', err.message);
    return null;
  }
}
