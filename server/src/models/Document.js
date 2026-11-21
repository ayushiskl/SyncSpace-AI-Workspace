import mongoose from 'mongoose';

const collaboratorSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    role: {
      type: String,
      enum: ['editor', 'viewer'],
      default: 'editor',
    },
    addedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false }
);

const documentSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Document title is required'],
      trim: true,
      maxlength: [160, 'Title must be under 160 characters'],
      default: 'Untitled Document',
    },
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    collaborators: {
      type: [collaboratorSchema],
      default: [],
    },
    permissions: {
      publicAccess: {
        type: String,
        enum: ['none', 'view', 'edit'],
        default: 'none',
      },
      allowAI: {
        type: Boolean,
        default: true,
      },
    },
    lastEditedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    excerpt: {
      type: String,
      default: '',
      maxlength: 400,
    },
    currentVersion: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

documentSchema.index({ 'collaborators.userId': 1 });
documentSchema.index({ updatedAt: -1 });

documentSchema.methods.getUserRole = function (userId) {
  if (!userId) return null;
  const uid = userId.toString();
  const ownerStr = this.ownerId?._id ? this.ownerId._id.toString() : this.ownerId?.toString();
  if (ownerStr === uid) return 'owner';

  const collab = this.collaborators.find((c) => {
    const cid = c.userId?._id ? c.userId._id.toString() : c.userId?.toString();
    return cid === uid;
  });
  if (collab) return collab.role;

  if (this.permissions?.publicAccess === 'edit') return 'editor';
  if (this.permissions?.publicAccess === 'view') return 'viewer';
  return null;
};

documentSchema.methods.canView = function (userId) {
  return this.getUserRole(userId) !== null;
};

documentSchema.methods.canEdit = function (userId) {
  const role = this.getUserRole(userId);
  return role === 'owner' || role === 'editor';
};

export const Document = mongoose.model('Document', documentSchema);
