import React, { useMemo } from 'react';
import { diffWordsWithSpace } from 'diff';

export function DiffViewer({ fromText = '', toText = '', className = '' }) {
  const parts = useMemo(() => diffWordsWithSpace(fromText || '', toText || ''), [fromText, toText]);

  return (
    <div
      className={`whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-50/70 p-3 text-xs leading-relaxed text-slate-800 dark:border-slate-700 dark:bg-slate-950/60 dark:text-slate-200 ${className}`}
    >
      {parts.map((part, idx) => {
        if (part.added) {
          return (
            <span
              key={idx}
              className="rounded bg-emerald-100 px-0.5 font-medium text-emerald-900 dark:bg-emerald-500/25 dark:text-emerald-200"
            >
              {part.value}
            </span>
          );
        }
        if (part.removed) {
          return (
            <span
              key={idx}
              className="rounded bg-rose-100 px-0.5 text-rose-800 line-through dark:bg-rose-500/25 dark:text-rose-200"
            >
              {part.value}
            </span>
          );
        }
        return <span key={idx}>{part.value}</span>;
      })}
    </div>
  );
}
