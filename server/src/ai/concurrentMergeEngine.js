import { diffWordsWithSpace } from 'diff';

/**
 * Convert a base -> target transformation into normalized edit operations
 * anchored to character intervals [start, end) in `baseText`.
 */
export function computeEditOperations(baseText, modifiedText) {
  const parts = diffWordsWithSpace(baseText, modifiedText);
  const ops = [];
  let basePos = 0;
  let i = 0;

  while (i < parts.length) {
    const part = parts[i];
    if (!part.added && !part.removed) {
      basePos += part.value.length;
      i += 1;
      continue;
    }

    const start = basePos;
    let removed = '';
    let inserted = '';

    // Coalesce adjacent removed + added chunks into a single atomic edit span
    while (i < parts.length && (parts[i].removed || parts[i].added)) {
      if (parts[i].removed) {
        removed += parts[i].value;
        basePos += parts[i].value.length;
      } else if (parts[i].added) {
        inserted += parts[i].value;
      }
      i += 1;
    }

    ops.push({
      start,
      end: basePos,
      removed,
      inserted,
      isInsertion: start === basePos,
    });
  }

  return ops;
}

/**
 * Check if two base-coordinate edit operations overlap or collide.
 * Uses a small boundary guard so adjacent edits to the exact same token/phrase
 * are treated conservatively as conflicts rather than silently mangling grammar.
 */
export function opsOverlap(opA, opB) {
  // Both are pure insertions at the exact same position
  if (opA.isInsertion && opB.isInsertion) {
    return opA.start === opB.start;
  }

  // One is a pure insertion inside or directly touching the other's modified range
  if (opA.isInsertion) {
    return opA.start >= opB.start && opA.start <= opB.end;
  }
  if (opB.isInsertion) {
    return opB.start >= opA.start && opB.start <= opA.end;
  }

  // Both are range replacements/deletions: check interval intersection (including touching boundaries)
  return Math.max(opA.start, opB.start) <= Math.min(opA.end, opB.end);
}

/**
 * Apply a sorted, non-overlapping list of edit operations to `baseText`.
 */
function applyDisjointOps(baseText, ops) {
  const sorted = [...ops].sort((a, b) => {
    if (a.start !== b.start) return a.start - b.start;
    return a.end - b.end;
  });

  let result = '';
  let cursor = 0;

  for (const op of sorted) {
    if (op.start < cursor) continue; // Defensive safety guard
    result += baseText.slice(cursor, op.start);
    result += op.inserted;
    cursor = op.end;
  }

  result += baseText.slice(cursor);
  return result;
}

/**
 * Core Three-Way Concurrent Human + AI Merge Analyzer.
 *
 * Inputs:
 *  - baseText: Section text captured when the AI started processing
 *  - humanText: Live section text currently in the Y.Doc (including any concurrent human edits)
 *  - aiText: Proposed rewrite returned by Gemini based on `baseText`
 *
 * Guarantees:
 *  1. Human edits are NEVER silently overwritten.
 *  2. If no human edited the target section, returns a clean apply plan.
 *  3. If a human edited a DISJOINT part of the same section (e.g., appended a sentence
 *     or edited a different clause), applies ONLY the non-overlapping AI edits while
 *     preserving 100% of human edits (`three-way-safe-merge`).
 *  4. If a human edited an OVERLAPPING span, flags a structured Conflict for human review
 *     and computes `safeMergedContent` that keeps all human edits + only non-conflicting AI hunks.
 */
export function analyzeThreeWayMerge(baseText = '', humanText = '', aiText = '') {
  const normBase = baseText.replace(/\r\n/g, '\n');
  const normHuman = humanText.replace(/\r\n/g, '\n');
  const normAi = aiText.replace(/\r\n/g, '\n');

  // Case 1: No concurrent human edits in this section
  if (normBase === normHuman) {
    const aiOps = computeEditOperations(normBase, normAi);
    return {
      concurrentHumanEditsDetected: false,
      hasConflict: false,
      autoMergeable: true,
      mergeStrategy: 'clean-apply',
      humanChanges: [],
      conflicts: [],
      safeAiOpsCount: aiOps.length,
      conflictingAiOpsCount: 0,
      safeMergedContent: normAi,
      summary: 'No concurrent human edits detected. AI proposal can be applied cleanly via minimal CRDT diff.',
    };
  }

  // Case 2: Concurrent human edits occurred while AI was processing!
  const humanOps = computeEditOperations(normBase, normHuman);
  const aiOps = computeEditOperations(normBase, normAi);

  const safeAiOps = [];
  const conflictingAiOps = [];
  const conflicts = [];

  for (let idx = 0; idx < aiOps.length; idx += 1) {
    const aiOp = aiOps[idx];
    const collidingHumanOps = humanOps.filter((hOp) => opsOverlap(hOp, aiOp));

    if (collidingHumanOps.length === 0) {
      safeAiOps.push(aiOp);
    } else {
      // Check if human and AI made the exact same edit — if identical, no real conflict!
      const identical =
        collidingHumanOps.length === 1 &&
        collidingHumanOps[0].start === aiOp.start &&
        collidingHumanOps[0].end === aiOp.end &&
        collidingHumanOps[0].inserted === aiOp.inserted;

      if (!identical) {
        conflictingAiOps.push(aiOp);
        const spanStart = Math.min(aiOp.start, ...collidingHumanOps.map((h) => h.start));
        const spanEnd = Math.max(aiOp.end, ...collidingHumanOps.map((h) => h.end));

        const baseSegment = normBase.slice(spanStart, spanEnd);
        const humanSegment = applyDisjointOps(
          baseSegment,
          collidingHumanOps.map((h) => ({
            ...h,
            start: h.start - spanStart,
            end: h.end - spanStart,
          }))
        );
        const aiSegment = applyDisjointOps(baseSegment, [
          {
            ...aiOp,
            start: aiOp.start - spanStart,
            end: aiOp.end - spanStart,
          },
        ]);

        conflicts.push({
          id: `conflict-${idx + 1}`,
          startOffset: spanStart,
          endOffset: spanEnd,
          baseText: baseSegment,
          humanText: humanSegment,
          aiText: aiSegment,
          reason: 'Human modified text overlapping with the AI rewrite span while AI was generating.',
        });
      }
    }
  }

  // Safe merged content ALWAYS includes 100% of humanOps + ONLY non-overlapping safeAiOps
  const combinedSafeOps = [
    ...humanOps.map((op) => ({ ...op, source: 'human' })),
    ...safeAiOps.map((op) => ({ ...op, source: 'ai' })),
  ];
  const safeMergedContent = applyDisjointOps(normBase, combinedSafeOps);

  const hasConflict = conflicts.length > 0;
  let mergeStrategy = 'three-way-safe-merge';
  let summary =
    'Concurrent human edits detected in a non-overlapping part of this section. All human edits are preserved and safe AI edits can be merged automatically.';

  if (hasConflict && safeAiOps.length > 0) {
    mergeStrategy = 'partial-safe-with-conflict';
    summary = `Concurrent human edits overlap with ${conflicts.length} AI change(s). ${safeAiOps.length} non-overlapping AI change(s) can be safely applied while preserving all human edits; conflicting spans require human review.`;
  } else if (hasConflict && safeAiOps.length === 0) {
    mergeStrategy = 'full-conflict-review';
    summary = `Human edits overlap directly with the AI rewrite (${conflicts.length} conflict(s)). Automatic overwrite was blocked to protect newer human changes. Please review before applying.`;
  }

  const humanChanges = humanOps.map((op, i) => ({
    id: `human-edit-${i + 1}`,
    startOffset: op.start,
    endOffset: op.end,
    removed: op.removed,
    inserted: op.inserted,
    type: op.isInsertion ? 'insertion' : op.inserted ? 'replacement' : 'deletion',
  }));

  return {
    concurrentHumanEditsDetected: true,
    hasConflict,
    autoMergeable: !hasConflict,
    mergeStrategy,
    humanChanges,
    conflicts,
    safeAiOpsCount: safeAiOps.length,
    conflictingAiOpsCount: conflictingAiOps.length,
    safeMergedContent,
    summary,
  };
}
