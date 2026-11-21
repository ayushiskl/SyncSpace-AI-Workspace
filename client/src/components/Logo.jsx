import React from 'react';

export function Logo({ compact = false, className = '' }) {
  return (
    <div className={`inline-flex items-center gap-2.5 select-none ${className}`}>
      <div className="relative flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-600 via-violet-600 to-cyan-500 text-white shadow-sm">
        <svg className="h-4.5 w-4.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
          <path d="M7 8h10M7 12h6M7 16h8" strokeLinecap="round" />
          <circle cx="17.5" cy="14.5" r="2.5" fill="currentColor" stroke="none" />
        </svg>
      </div>
      {!compact && (
        <div className="flex items-baseline gap-1">
          <span className="text-[15px] font-bold tracking-tight text-slate-900 dark:text-white">
            SyncSpace
          </span>
          <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-400">
            AI
          </span>
        </div>
      )}
    </div>
  );
}
