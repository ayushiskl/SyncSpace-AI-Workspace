import { AgentExecution } from '../models/AgentExecution.js';
import { Document } from '../models/Document.js';
import {
  applyAIExecution,
  executeAIAction,
  inspectExecutionLiveState,
  rejectAIExecution,
} from '../ai/aiAgentService.js';

async function verifyExecutionEditPermission(executionId, userId) {
  const execution = await AgentExecution.findById(executionId);
  if (!execution) {
    const err = new Error('AI execution record not found.');
    err.statusCode = 404;
    throw err;
  }
  const doc = await Document.findById(execution.documentId);
  if (!doc || !doc.canEdit(userId)) {
    const err = new Error('You do not have edit permission for this document.');
    err.statusCode = 403;
    throw err;
  }
  return execution;
}

function createActionHandler(defaultActionType, defaultInstruction) {
  return async (req, res, next) => {
    try {
      const {
        documentId,
        instruction,
        selectedText = '',
        sectionIndex = null,
        blockIndex = null,
        actionType,
      } = req.body || {};

      const resolvedInstruction = String(instruction || defaultInstruction).trim();
      if (!resolvedInstruction) {
        return res.status(400).json({
          success: false,
          message: 'Instruction is required.',
        });
      }

      const execution = await executeAIAction({
        documentId,
        userId: req.user._id,
        actionType: actionType || defaultActionType,
        instruction: resolvedInstruction,
        selectedText,
        sectionIndex,
        blockIndex,
      });

      res.status(201).json({
        success: true,
        execution,
      });
    } catch (err) {
      next(err);
    }
  };
}

export const rewriteWithAI = createActionHandler('rewrite', 'Rewrite this section clearly and professionally.');
export const summarizeWithAI = createActionHandler('summarize', 'Summarize this content concisely.');
export const improveWithAI = createActionHandler('improve', 'Improve grammar, clarity, and tone.');
export const executeCustomAI = createActionHandler('custom', '');

export async function listExecutions(req, res, next) {
  try {
    const executions = await AgentExecution.find({ documentId: req.document._id })
      .sort({ createdAt: -1 })
      .limit(30)
      .populate('userId', 'name email cursorColor')
      .lean();

    res.json({
      success: true,
      executions,
    });
  } catch (err) {
    next(err);
  }
}

export async function liveCheckExecution(req, res, next) {
  try {
    const execution = await verifyExecutionEditPermission(req.params.id, req.user._id);
    const { currentContent, liveMerge } = await inspectExecutionLiveState(execution);

    res.json({
      success: true,
      currentContent,
      mergeAnalysis: liveMerge,
      safeMergedContent: liveMerge.safeMergedContent,
      hasConflict: liveMerge.hasConflict,
    });
  } catch (err) {
    next(err);
  }
}

export async function applyExecution(req, res, next) {
  try {
    await verifyExecutionEditPermission(req.params.id, req.user._id);
    const { mode = 'apply_safe', customContent = null, allowPartialSafe = false } = req.body || {};

    const result = await applyAIExecution({
      executionId: req.params.id,
      userId: req.user._id,
      mode,
      customContent,
      allowPartialSafe,
    });

    res.json({
      success: true,
      ...result,
    });
  } catch (err) {
    next(err);
  }
}

export async function rejectExecution(req, res, next) {
  try {
    await verifyExecutionEditPermission(req.params.id, req.user._id);
    const execution = await rejectAIExecution({
      executionId: req.params.id,
      userId: req.user._id,
    });

    res.json({
      success: true,
      execution,
    });
  } catch (err) {
    next(err);
  }
}
