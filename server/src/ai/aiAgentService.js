import { AgentExecution } from '../models/AgentExecution.js';
import { Document } from '../models/Document.js';
import { roomManager } from '../collaboration/roomManager.js';
import {
  applyTextToAnchors,
  captureTargetAnchors,
  extractSections,
  resolveLiveAnchors,
  resolveTargetSection,
} from '../collaboration/yjsDocUtils.js';
import { analyzeThreeWayMerge } from './concurrentMergeEngine.js';
import { generateTargetedEdit } from './geminiService.js';
import { logActivity } from '../services/activityService.js';

/**
 * Execute an AI writing operation safely against a live collaborative Y.Doc.
 *
 * Concurrency guarantee:
 *  1. Captures exact CRDT state vector + RelativePosition anchors BEFORE calling Gemini.
 *  2. Humans remain 100% unblocked and can edit any part of the document while Gemini runs.
 *  3. When Gemini responds, resolves the live RelativePosition anchors to obtain the latest
 *     human state and performs a Three-Way Merge analysis.
 *  4. Never blindly overwrites human edits: overlapping edits transition the execution to
 *     `Conflict` for human review, while disjoint edits produce a safe merged proposal.
 */
export async function executeAIAction({
  documentId,
  userId,
  actionType = 'rewrite',
  instruction,
  selectedText = '',
  sectionIndex = null,
  blockIndex = null,
}) {
  const docRecord = await Document.findById(documentId);
  if (!docRecord) {
    const err = new Error('Document not found');
    err.statusCode = 404;
    throw err;
  }

  const room = await roomManager.getOrCreateRoom(documentId);

  // 1. Target resolution & CRDT anchor capture
  const target = resolveTargetSection(room.doc, {
    instruction,
    selectedText,
    sectionIndex,
    blockIndex,
  });

  if (!target.originalContent || target.originalContent.trim().length === 0) {
    const err = new Error('Target section is empty. Add some content before running the AI agent.');
    err.statusCode = 400;
    throw err;
  }

  const baseVersion = room.version;
  const anchorSnapshot = captureTargetAnchors(room.doc, target);

  // Build brief surrounding context (section headings) without sending entire document
  const sections = extractSections(room.doc);
  const surroundingContext = sections
    .map((s) => (s.headingText ? `- ${s.headingText}` : null))
    .filter(Boolean)
    .join('\n');

  // 2. Persist initial execution record in Processing state
  const execution = await AgentExecution.create({
    documentId,
    userId,
    agentName: 'Writing Assistant',
    actionType,
    instruction,
    targetSection: {
      type: target.type,
      label: target.label,
      headingText: target.headingText,
      sectionIndex: target.sectionIndex,
      blockIndices: target.blockIndices,
      selectedText: selectedText || '',
    },
    originalContent: target.originalContent,
    baseVersion,
    baseStateVector: anchorSnapshot.baseStateVector,
    anchorSnapshot,
    status: 'Processing',
  });

  await logActivity({
    documentId,
    userId,
    action: 'ai_started',
    description: `Writing Assistant started "${instruction.slice(0, 80)}" on ${target.label}`,
    metadata: { executionId: execution._id.toString(), targetLabel: target.label, baseVersion },
  });

  // Broadcast live AI presence to all connected collaborators via Yjs Awareness
  room.setAIAgentPresence({
    agentName: 'Writing Assistant',
    status: 'Processing',
    targetLabel: target.label,
    instruction,
  });

  try {
    // 3. Asynchronous AI generation (humans keep typing in real time!)
    const aiResult = await generateTargetedEdit({
      actionType,
      instruction,
      documentTitle: docRecord.title,
      sectionLabel: target.label,
      originalContent: target.originalContent,
      surroundingContext,
    });

    // 4. Re-read live Y.Doc using captured Yjs RelativePositions
    const { currentContent } = resolveLiveAnchors(room.doc, anchorSnapshot);

    // 5. Three-Way Concurrent Human + AI Merge Analysis
    const mergeAnalysis = analyzeThreeWayMerge(
      target.originalContent,
      currentContent,
      aiResult.proposedContent
    );

    const finalStatus = mergeAnalysis.hasConflict ? 'Conflict' : 'Completed';

    execution.proposedContent = aiResult.proposedContent;
    execution.aiExplanation = aiResult.explanation || '';
    execution.currentContentAtCompletion = currentContent;
    execution.safeMergedContent = mergeAnalysis.safeMergedContent;
    execution.mergeAnalysis = mergeAnalysis;
    execution.status = finalStatus;
    execution.completedAt = new Date();
    await execution.save();

    await logActivity({
      documentId,
      userId,
      action: mergeAnalysis.hasConflict ? 'ai_conflict_detected' : 'ai_completed',
      description: mergeAnalysis.hasConflict
        ? `Concurrent edit conflict detected on ${target.label} — awaiting human review`
        : `Writing Assistant generated a proposal for ${target.label}`,
      metadata: {
        executionId: execution._id.toString(),
        status: finalStatus,
        mergeStrategy: mergeAnalysis.mergeStrategy,
        conflictCount: mergeAnalysis.conflicts.length,
      },
    });

    room.setAIAgentPresence(null);

    return execution.toObject();
  } catch (err) {
    execution.status = 'Failed';
    execution.errorMessage = err.message || 'AI execution failed';
    execution.completedAt = new Date();
    await execution.save();

    await logActivity({
      documentId,
      userId,
      action: 'ai_failed',
      description: `Writing Assistant failed on ${target.label}: ${execution.errorMessage.slice(0, 100)}`,
      metadata: { executionId: execution._id.toString() },
    });

    room.setAIAgentPresence(null);
    throw err;
  }
}

/**
 * Inspect live merge state right before applying (re-checks for late human edits).
 */
export async function inspectExecutionLiveState(execution) {
  const room = await roomManager.getOrCreateRoom(execution.documentId);
  const { currentContent } = resolveLiveAnchors(room.doc, execution.anchorSnapshot);
  const liveMerge = analyzeThreeWayMerge(
    execution.originalContent,
    currentContent,
    execution.proposedContent
  );
  return { room, currentContent, liveMerge };
}

/**
 * Apply an AI execution proposal safely into the authoritative Y.Doc.
 *
 * Modes:
 *  - 'apply_safe' (default): Applies clean or non-overlapping AI edits while preserving 100%
 *    of concurrent human edits. If overlapping conflicts exist and `allowPartialSafe` is false,
 *    refuses to overwrite and returns a 409 conflict payload with refreshed live state.
 *  - 'accept_merged': Applies the human-reviewed merged text (`customContent` or `safeMergedContent`).
 *  - 'accept_ai': Explicitly applies the full AI proposal after human review.
 */
export async function applyAIExecution({
  executionId,
  userId,
  mode = 'apply_safe',
  customContent = null,
  allowPartialSafe = false,
}) {
  const execution = await AgentExecution.findById(executionId);
  if (!execution) {
    const err = new Error('AI execution not found');
    err.statusCode = 404;
    throw err;
  }

  if (execution.status === 'Applied') {
    const err = new Error('This AI proposal has already been applied.');
    err.statusCode = 400;
    throw err;
  }
  if (execution.status === 'Rejected' || execution.status === 'Failed') {
    const err = new Error(`Cannot apply an AI execution in "${execution.status}" state.`);
    err.statusCode = 400;
    throw err;
  }

  const { room, currentContent, liveMerge } = await inspectExecutionLiveState(execution);

  let textToApply = '';
  let resolvedMode = mode;

  if (mode === 'apply_safe') {
    if (liveMerge.hasConflict && !allowPartialSafe) {
      // Update execution with freshest live state so the UI can show exact up-to-date conflict
      execution.currentContentAtCompletion = currentContent;
      execution.safeMergedContent = liveMerge.safeMergedContent;
      execution.mergeAnalysis = liveMerge;
      execution.status = 'Conflict';
      await execution.save();

      const err = new Error(
        'Overlapping concurrent human edits detected. Review the conflict or apply only safe non-overlapping changes.'
      );
      err.statusCode = 409;
      err.code = 'CONCURRENT_EDIT_CONFLICT';
      err.execution = execution.toObject();
      throw err;
    }
    textToApply = liveMerge.safeMergedContent;
  } else if (mode === 'accept_merged') {
    textToApply =
      typeof customContent === 'string' && customContent.length > 0
        ? customContent
        : liveMerge.safeMergedContent;
  } else if (mode === 'accept_ai') {
    textToApply = execution.proposedContent;
  } else {
    const err = new Error(`Invalid resolution mode: ${mode}`);
    err.statusCode = 400;
    throw err;
  }

  // Commit minimal surgical CRDT diff into live Y.Doc (broadcasts to all connected clients)
  const commitResult = applyTextToAnchors(
    room.doc,
    execution.anchorSnapshot,
    textToApply,
    'ai-agent'
  );

  // Persist snapshot immediately after AI commit
  await room.persistNow(userId);

  execution.currentContentAtCompletion = currentContent;
  execution.safeMergedContent = liveMerge.safeMergedContent;
  execution.mergeAnalysis = liveMerge;
  execution.status = 'Applied';
  execution.resolutionMode = resolvedMode;
  execution.appliedAt = new Date();
  await execution.save();

  await logActivity({
    documentId: execution.documentId,
    userId,
    action: 'ai_applied',
    description: `Applied Writing Assistant changes (${resolvedMode}) to ${execution.targetSection?.label || 'document'}`,
    metadata: {
      executionId: execution._id.toString(),
      resolutionMode: resolvedMode,
      operations: commitResult.operations,
      preservedHumanEdits: liveMerge.concurrentHumanEditsDetected && resolvedMode !== 'accept_ai',
    },
  });

  return {
    execution: execution.toObject(),
    commitResult,
    appliedContent: textToApply,
  };
}

export async function rejectAIExecution({ executionId, userId }) {
  const execution = await AgentExecution.findById(executionId);
  if (!execution) {
    const err = new Error('AI execution not found');
    err.statusCode = 404;
    throw err;
  }

  if (execution.status === 'Applied') {
    const err = new Error('Cannot reject an execution that was already applied.');
    err.statusCode = 400;
    throw err;
  }

  execution.status = 'Rejected';
  execution.resolutionMode = 'reject';
  await execution.save();

  await logActivity({
    documentId: execution.documentId,
    userId,
    action: 'ai_rejected',
    description: `Rejected Writing Assistant proposal for ${execution.targetSection?.label || 'document'}`,
    metadata: { executionId: execution._id.toString() },
  });

  return execution.toObject();
}
