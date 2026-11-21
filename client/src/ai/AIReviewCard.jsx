import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  GitMerge,
  RefreshCw,
  ShieldCheck,
  X,
  XCircle,
} from 'lucide-react';
import { DiffViewer } from './DiffViewer';

const STATUS_BADGES = {
  Completed: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30',
  Conflict: 'bg-amber-50 text-amber-800 border-amber-300 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/40',
  Applied: 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-500/15 dark:text-indigo-300 dark:border-indigo-500/30',
  Rejected: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700',
  Failed: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/15 dark:text-rose-300 dark:border-rose-500/30',
  Processing: 'bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-500/15 dark:text-violet-300 dark:border-violet-500/30',
};

export function AIReviewCard({
  execution,
  onApply,
  onReject,
  onRefreshLiveCheck,
  busy = false,
}) {
  const [activeTab, setActiveTab] = useState('diff'); // diff | compare | resolve
  const [customMerged, setCustomMerged] = useState('');

  const merge = execution?.mergeAnalysis || {};
  const hasConflict = Boolean(merge.hasConflict || execution?.status === 'Conflict');
  const hasConcurrentHumanEdits = Boolean(merge.concurrentHumanEditsDetected);
  const currentContent = execution?.currentContentAtCompletion ?? execution?.originalContent ?? '';
  const safeMerged = execution?.safeMergedContent ?? execution?.proposedContent ?? '';
  const isActionable = execution?.status === 'Completed' || execution?.status === 'Conflict';

  useEffect(() => {
    setCustomMerged(safeMerged);
    if (hasConflict) {
      setActiveTab('compare');
    } else {
      setActiveTab('diff');
    }
  }, [execution?._id, safeMerged, hasConflict]);

  if (!execution) return null;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm dark:border-slate-700/80 dark:bg-slate-900">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
                STATUS_BADGES[execution.status] || STATUS_BADGES.Completed
              }`}
            >
              {hasConflict && <AlertTriangle className="h-3 w-3" />}
              {execution.status === 'Applied' && <CheckCircle2 className="h-3 w-3" />}
              {execution.status === 'Rejected' && <XCircle className="h-3 w-3" />}
              {execution.status}
            </span>
            <span className="truncate text-[11px] font-medium text-slate-500 dark:text-slate-400">
              {execution.targetSection?.label || 'Target Section'} · v{execution.baseVersion}
            </span>
          </div>
          <p className="mt-1.5 text-xs font-semibold text-slate-900 dark:text-white">
            "{execution.instruction}"
          </p>
          {execution.aiExplanation && (
            <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
              {execution.aiExplanation}
            </p>
          )}
        </div>

        {isActionable && onRefreshLiveCheck && (
          <button
            type="button"
            onClick={() => onRefreshLiveCheck(execution._id)}
            disabled={busy}
            title="Re-check live document for new concurrent human edits"
            className="shrink-0 rounded-md p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${busy ? 'animate-spin' : ''}`} />
          </button>
        )}
      </div>

      {/* Concurrent Edit Protection Banner */}
      {hasConflict ? (
        <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
          <div className="flex items-center gap-1.5 font-semibold">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
            Concurrent Human Edit Conflict Detected
          </div>
          <p className="mt-1 text-[11px] leading-relaxed opacity-90">
            {merge.summary ||
              'A human edited this section while Writing Assistant was running. Auto-overwrite was blocked to protect newer human changes.'}
          </p>
        </div>
      ) : hasConcurrentHumanEdits ? (
        <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-2.5 text-xs text-emerald-900 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200">
          <div className="flex items-center gap-1.5 font-semibold">
            <GitMerge className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
            Safe Three-Way Merge Ready
          </div>
          <p className="mt-1 text-[11px] leading-relaxed opacity-90">
            {merge.summary ||
              'Non-overlapping human edits were detected and preserved in the merged proposal.'}
          </p>
        </div>
      ) : null}

      {/* View Switcher */}
      <div className="mt-3 flex gap-1 rounded-lg bg-slate-100 p-0.5 text-[11px] font-medium dark:bg-slate-800">
        <button
          type="button"
          onClick={() => setActiveTab('diff')}
          className={`flex-1 rounded-md py-1 transition ${
            activeTab === 'diff'
              ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white'
              : 'text-slate-600 hover:text-slate-900 dark:text-slate-400'
          }`}
        >
          Live Diff
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('compare')}
          className={`flex-1 rounded-md py-1 transition ${
            activeTab === 'compare'
              ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white'
              : 'text-slate-600 hover:text-slate-900 dark:text-slate-400'
          }`}
        >
          3-Way View
        </button>
        {isActionable && (
          <button
            type="button"
            onClick={() => setActiveTab('resolve')}
            className={`flex-1 rounded-md py-1 transition ${
              activeTab === 'resolve'
                ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400'
            }`}
          >
            Edit Merge
          </button>
        )}
      </div>

      {/* Tab Body */}
      <div className="mt-2.5 space-y-2.5">
        {activeTab === 'diff' && (
          <div>
            <div className="mb-1 flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              <span>Current Live vs {hasConflict ? 'Safe Merged' : 'AI Proposal'}</span>
            </div>
            <DiffViewer fromText={currentContent} toText={hasConflict ? safeMerged : execution.proposedContent} />
          </div>
        )}

        {activeTab === 'compare' && (
          <div className="space-y-2 text-xs">
            <div>
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                1. Original (when AI started at v{execution.baseVersion})
              </div>
              <div className="max-h-24 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-2 text-[11px] leading-relaxed text-slate-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300">
                {execution.originalContent}
              </div>
            </div>

            <div>
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
                2. Current Live Document (Human State)
              </div>
              <div className="max-h-24 overflow-y-auto rounded-lg border border-indigo-200 bg-indigo-50/40 p-2 text-[11px] leading-relaxed text-slate-800 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-slate-100">
                {currentContent}
              </div>
            </div>

            <div>
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-violet-600 dark:text-violet-400">
                3. AI Proposed Rewrite
              </div>
              <div className="max-h-24 overflow-y-auto rounded-lg border border-violet-200 bg-violet-50/40 p-2 text-[11px] leading-relaxed text-slate-800 dark:border-violet-500/30 dark:bg-violet-500/10 dark:text-slate-100">
                {execution.proposedContent}
              </div>
            </div>

            {Array.isArray(merge.conflicts) && merge.conflicts.length > 0 && (
              <div className="space-y-1.5 pt-1">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                  Overlapping Conflict Spans ({merge.conflicts.length})
                </div>
                {merge.conflicts.map((c) => (
                  <div
                    key={c.id}
                    className="rounded-lg border border-amber-200 bg-amber-50/60 p-2 text-[11px] dark:border-amber-500/30 dark:bg-amber-500/10"
                  >
                    <div className="text-slate-700 dark:text-slate-200">
                      <span className="font-semibold text-indigo-700 dark:text-indigo-300">Human: </span>
                      {c.humanText || '(deleted)'}
                    </div>
                    <div className="mt-0.5 text-slate-700 dark:text-slate-200">
                      <span className="font-semibold text-violet-700 dark:text-violet-300">AI: </span>
                      {c.aiText || '(deleted)'}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'resolve' && isActionable && (
          <div>
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              Review & Customize Merged Content (Human edits preserved by default)
            </label>
            <textarea
              value={customMerged}
              onChange={(e) => setCustomMerged(e.target.value)}
              rows={6}
              className="w-full rounded-lg border border-slate-300 bg-white p-2.5 text-xs leading-relaxed text-slate-800 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
          </div>
        )}
      </div>

      {/* Action Buttons */}
      {isActionable && (
        <div className="mt-3.5 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
          {!hasConflict ? (
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                onApply(execution._id, {
                  mode: activeTab === 'resolve' ? 'accept_merged' : 'apply_safe',
                  customContent: activeTab === 'resolve' ? customMerged : undefined,
                })
              }
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:opacity-50"
            >
              <ShieldCheck className="h-3.5 w-3.5" />
              {hasConcurrentHumanEdits ? 'Apply Safe Merge' : 'Apply Changes'}
            </button>
          ) : (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  onApply(execution._id, {
                    mode: 'accept_merged',
                    customContent: customMerged,
                  })
                }
                className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-50"
              >
                <GitMerge className="h-3.5 w-3.5" />
                Apply Safe / Merged
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => onApply(execution._id, { mode: 'accept_ai' })}
                className="inline-flex items-center justify-center gap-1 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-xs font-semibold text-amber-800 transition hover:bg-amber-100 disabled:opacity-50 dark:border-amber-500/40 dark:bg-amber-500/15 dark:text-amber-200"
                title="Override conflicting human edits with full AI proposal"
              >
                <Check className="h-3.5 w-3.5" />
                Use AI Only
              </button>
            </>
          )}

          <button
            type="button"
            disabled={busy}
            onClick={() => onReject(execution._id)}
            className="inline-flex items-center justify-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50 hover:text-rose-600 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:text-rose-400"
          >
            <X className="h-3.5 w-3.5" />
            Reject
          </button>
        </div>
      )}
    </div>
  );
}
