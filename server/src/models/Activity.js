import mongoose from 'mongoose';

const activitySchema = new mongoose.Schema(
  {
    documentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Document',
      required: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    action: {
      type: String,
      required: true,
      enum: [
        'document_created',
        'document_renamed',
        'collaborator_added',
        'collaborator_removed',
        'permissions_updated',
        'snapshot_saved',
        'ai_started',
        'ai_completed',
        'ai_conflict_detected',
        'ai_applied',
        'ai_rejected',
        'ai_failed',
      ],
    },
    description: {
      type: String,
      required: true,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    timestamp: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: false,
  }
);

activitySchema.index({ documentId: 1, timestamp: -1 });

export const Activity = mongoose.model('Activity', activitySchema);
