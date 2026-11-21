import React, { useState } from 'react';
import {
  Bot,
  Clock,
  Loader2,
  Send,
  Sparkles,
  Wand2,
  AlertCircle,
  CheckCircle2,
  AlertTriangle,
  History,
} from 'lucide-react';
import { aiAPI } from '../services/api';
import { AIReviewCard } from './AIReviewCard';

const SUGGESTED_PROMPTS = [
  { label: 'Rewrite section 3', actionType: 'rewrite', instruction: 'Rewrite section 3 to be clearer, sharper, and more impactful.' },
  { label: 'Improve the selected paragraph', actionType: 'improve', instruction: 'Improve the clarity, flow, and impact of this paragraph.' },
  { label: 'Summarize this document', actionType: 'summarize', instruction: 'Summarize the key points concisely.' },
  { label: 'Fix grammar', actionType: 'grammar', instruction: 'Fix all grammar, spelling, and punctuation errors with minimal stylistic changes.' },
  { label: 'Make the content more professional', actionType: 'tone', instruction: 'Rewrite this content in a polished, executive, professional tone.' },
  { label: 'Expand this section with examples', actionType: 'expand', instruction: 'Expand this section with concrete, practical examples.' },
];

export function AIAssistantPanel({
  documentId,
  readOnly = false,
  selectedText = '',
  outline = [],
  aiPresence = null,
  executions = [],
  onExecutionsChanged,
  onActivityChanged,
}) {
  const [instruction, setInstruction] = useState('');
  const [targetSectionIdx, setTargetSectionIdx] = useState('auto');
  const [isRunning, setIsRunning] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [activeExecution, setActiveExecution] = useState(null);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');

  const sectionOptions = outline.filter((h) => h.sectionIndex !== null);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 4000);
  };

  const runAI = async ({ promptText, actionType = 'rewrite' }) => {
    const cleanPrompt = (promptText ?? instruction).trim();
    if (!cleanPrompt || readOnly) return;

    setError('');
    setIsRunning(true);

    try {
      const payload = {
        documentId,
        instruction: cleanPrompt,
        actionType,
        selectedText: targetSectionIdx === 'auto' ? selectedText : '',
        sectionIndex: targetSectionIdx !== 'auto' ? Number(targetSectionIdx) : null,
      };

      let data;
      if (actionType === 'summarize') {
        data = await aiAPI.summarize(payload);
      } else if (actionType === 'improve') {
        data = await aiAPI.improve(payload);
      } else if (actionType === 'rewrite') {
        data = await aiAPI.rewrite(payload);
      } else {
        data = await aiAPI.execute(payload);
      }

      setActiveExecution(data.execution);
      setInstruction('');
      onExecutionsChanged?.();
      onActivityChanged?.();
    } catch (err) {
      const msg = err.response?.data?.message || err.message || 'AI request failed.';
      setError(msg);
    } finally {
      setIsRunning(false);
    }
  };

  const handleApply = async (executionId, options) => {
    setError('');
    setActionBusy(true);
    try {
      const data = await aiAPI.apply(executionId, options);
      setActiveExecution(data.execution);
      showToast(
        data.execution?.mergeAnalysis?.concurrentHumanEditsDetected
          ? 'Applied safely while preserving concurrent human edits!'
          : 'AI changes applied to live document!'
      );
      onExecutionsChanged?.();
      onActivityChanged?.();
    } catch (err) {
      if (err.response?.status === 409 && err.response?.data?.execution) {
        setActiveExecution(err.response.data.execution);
        setError('New human edits arrived while you were reviewing! Please inspect the updated conflict.');
      } else {
        setError(err.response?.data?.message || 'Failed to apply AI changes.');
      }
    } finally {
      setActionBusy(false);
    }
  };

  const handleReject = async (executionId) => {
    setError('');
    setActionBusy(true);
    try {
      const data = await aiAPI.reject(executionId);
      setActiveExecution(data.execution);
      showToast('AI proposal rejected.');
      onExecutionsChanged?.();
      onActivityChanged?.();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to reject AI proposal.');
    } finally {
      setActionBusy(false);
    }
  };

  const handleLiveCheck = async (executionId) => {
    setActionBusy(true);
    setError('');
    try {
      const data = await aiAPI.liveCheck(executionId);
      setActiveExecution((prev) =>
        prev && prev._id === executionId
          ? {
              ...prev,
              currentContentAtCompletion: data.currentContent,
              safeMergedContent: data.safeMergedContent,
              mergeAnalysis: data.mergeAnalysis,
              status: data.hasConflict ? 'Conflict' : prev.status,
            }
          : prev
      );
      showToast(
        data.hasConflict
          ? 'Live check: overlapping human edits detected.'
          : 'Live check: document is ready for safe merge.'
      );
    } catch (err) {
      setError(err.response?.data?.message || 'Live check failed.');
    } finally {
      setActionBusy(false);
    }
  };

  const displayedExecution = activeExecution || executions.find((e) => e.status === 'Conflict' || e.status === 'Completed');

  return (
    <aside className="flex h-full w-full flex-col border-l border-slate-200/80 bg-slate-50/70 dark:border-slate-800 dark:bg-slate-900/60">
      {/* AI Agent Header */}
      <div className="border-b border-slate-200/80 bg-white px-4 py-3.5 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 text-white shadow-sm">
              <Bot className="h-5 w-5" />
              <span
                className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-white dark:border-slate-900 ${
                  isRunning || aiPresence ? 'animate-pulse bg-amber-400' : 'bg-emerald-500'
                }`}
              />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">Writing Assistant</h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                {isRunning || aiPresence
                  ? `Working on ${aiPresence?.targetLabel || 'section'}...`
                  : 'CRDT-Safe AI Collaborator'}
              </p>
            </div>
          </div>
          <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-semibold text-violet-700 dark:bg-violet-500/15 dark:text-violet-300">
            <Sparkles className="h-3 w-3" />
            Gemini
          </span>
        </div>
      </div>

      {/* Scrollable Body */}
      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {/* Target Scope Selector */}
        <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-2 flex items-center justify-between">
            <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Target Scope
            </label>
            {selectedText && targetSectionIdx === 'auto' && (
              <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300">
                Selection Active ({selectedText.length} chars)
              </span>
            )}
          </div>

          <select
            value={targetSectionIdx}
            onChange={(e) => setTargetSectionIdx(e.target.value)}
            disabled={readOnly || isRunning}
            className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-medium text-slate-700 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          >
            <option value="auto">
              {selectedText ? 'Selected text (or auto-detect from prompt)' : 'Auto-detect section from prompt'}
            </option>
            {sectionOptions.map((sec) => (
              <option key={sec.id} value={sec.sectionIndex}>
                Section {sec.sectionIndex}: {sec.text}
              </option>
            ))}
          </select>

          {/* Prompt Input */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              runAI({ promptText: instruction, actionType: 'rewrite' });
            }}
            className="mt-2.5"
          >
            <textarea
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              disabled={readOnly || isRunning}
              rows={3}
              placeholder='e.g. "Rewrite section 3 to be more concise and technical"'
              className="w-full resize-none rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-xs text-slate-800 placeholder:text-slate-400 focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/15 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
            <button
              type="submit"
              disabled={readOnly || isRunning || !instruction.trim()}
              className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-gradient-to-r from-indigo-600 to-violet-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isRunning ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Generating Safe Proposal...
                </>
              ) : (
                <>
                  <Send className="h-3.5 w-3.5" />
                  Execute with Writing Assistant
                </>
              )}
            </button>
          </form>

          {isRunning && (
            <div className="mt-2.5 rounded-lg bg-indigo-50 px-2.5 py-2 text-[11px] leading-relaxed text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300">
              Keep typing freely! Concurrent human edits made right now are tracked via Yjs relative anchors and will never be overwritten.
            </div>
          )}
        </div>

        {/* Suggested Prompts */}
        <div>
          <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            <Wand2 className="h-3 w-3" />
            Suggested Prompts
          </div>
          <div className="flex flex-wrap gap-1.5">
            {SUGGESTED_PROMPTS.map((item) => (
              <button
                key={item.label}
                type="button"
                disabled={readOnly || isRunning}
                onClick={() => runAI({ promptText: item.instruction, actionType: item.actionType })}
                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-left text-[11px] font-medium text-slate-700 transition hover:border-indigo-300 hover:bg-indigo-50/50 hover:text-indigo-700 disabled:opacity-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-indigo-500/40 dark:hover:text-indigo-300"
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {/* Feedback banners */}
        {error && (
          <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {toast && (
          <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-medium text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>{toast}</span>
          </div>
        )}

        {/* Active Proposal Review Card */}
        {displayedExecution && (
          <div>
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              AI Edit Review
            </div>
            <AIReviewCard
              execution={displayedExecution}
              onApply={handleApply}
              onReject={handleReject}
              onRefreshLiveCheck={handleLiveCheck}
              busy={actionBusy}
            />
          </div>
        )}

        {/* Execution History */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              <History className="h-3 w-3" />
              Execution History ({executions.length})
            </span>
          </div>

          {executions.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 p-4 text-center text-xs text-slate-400 dark:border-slate-800">
              No AI executions yet. Try clicking "Rewrite section 3" above.
            </div>
          ) : (
            <div className="space-y-1.5">
              {executions.map((ex) => {
                const isSelected = displayedExecution?._id === ex._id;
                return (
                  <button
                    key={ex._id}
                    type="button"
                    onClick={() => setActiveExecution(ex)}
                    className={`w-full rounded-lg border p-2.5 text-left transition ${
                      isSelected
                        ? 'border-indigo-300 bg-indigo-50/50 dark:border-indigo-500/40 dark:bg-indigo-500/10'
                        : 'border-slate-200/80 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-xs font-semibold text-slate-800 dark:text-slate-100">
                        {ex.instruction}
                      </span>
                      <span
                        className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                          ex.status === 'Conflict'
                            ? 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300'
                            : ex.status === 'Applied'
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300'
                              : ex.status === 'Failed'
                                ? 'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300'
                                : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                        }`}
                      >
                        {ex.status === 'Conflict' && <AlertTriangle className="mr-0.5 inline h-2.5 w-2.5" />}
                        {ex.status}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center justify-between text-[10px] text-slate-400">
                      <span className="truncate">{ex.targetSection?.label || 'Document'}</span>
                      <span className="inline-flex shrink-0 items-center gap-1">
                        <Clock className="h-2.5 w-2.5" />
                        {new Date(ex.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
