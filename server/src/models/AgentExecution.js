import mongoose from 'mongoose';

const agentExecutionSchema = new mongoose.Schema(
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
      required: true,
    },
    agentName: {
      type: String,
      default: 'Writing Assistant',
    },
    actionType: {
      type: String,
      enum: ['rewrite', 'summarize', 'improve', 'grammar', 'expand', 'tone', 'headings', 'custom'],
      default: 'rewrite',
    },
    instruction: {
      type: String,
      required: true,
      trim: true,
    },
    targetSection: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    originalContent: {
      type: String,
      required: true,
    },
    proposedContent: {
      type: String,
      default: '',
    },
    currentContentAtCompletion: {
      type: String,
      default: '',
    },
    safeMergedContent: {
      type: String,
      default: '',
    },
    baseVersion: {
      type: Number,
      required: true,
      default: 0,
    },
    baseStateVector: {
      type: String,
      default: '',
    },
    anchorSnapshot: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    mergeAnalysis: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    aiExplanation: {
      type: String,
      default: '',
    },
    status: {
      type: String,
      enum: ['Pending', 'Processing', 'Completed', 'Conflict', 'Rejected', 'Failed', 'Applied'],
      default: 'Pending',
      index: true,
    },
    resolutionMode: {
      type: String,
      enum: [null, 'apply_safe', 'accept_merged', 'accept_ai', 'reject'],
      default: null,
    },
    errorMessage: {
      type: String,
      default: '',
    },
    completedAt: {
      type: Date,
      default: null,
    },
    appliedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

agentExecutionSchema.index({ documentId: 1, createdAt: -1 });

export const AgentExecution = mongoose.model('AgentExecution', agentExecutionSchema);
