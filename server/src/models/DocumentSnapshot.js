import mongoose from 'mongoose';

const documentSnapshotSchema = new mongoose.Schema(
  {
    documentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Document',
      required: true,
      index: true,
    },
    snapshotData: {
      type: Buffer,
      required: true,
    },
    stateVector: {
      type: Buffer,
      default: null,
    },
    version: {
      type: Number,
      required: true,
      default: 1,
    },
    plainTextPreview: {
      type: String,
      default: '',
      maxlength: 1000,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: false,
  }
);

documentSnapshotSchema.index({ documentId: 1, version: -1 });

export const DocumentSnapshot = mongoose.model('DocumentSnapshot', documentSnapshotSchema);
