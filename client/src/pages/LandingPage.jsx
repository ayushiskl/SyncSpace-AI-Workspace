import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowRight,
  Bot,
  CheckCircle2,
  Cpu,
  Database,
  GitMerge,
  Layers,
  Moon,
  ShieldCheck,
  Sparkles,
  Sun,
  Users,
  Zap,
} from 'lucide-react';
import { Logo } from '../components/Logo';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';

const FEATURES = [
  {
    icon: Users,
    title: 'Real-Time CRDT Collaboration',
    description:
      'Every keystroke syncs incrementally through Yjs CRDTs and WebSockets with live multiplayer cursors and instant presence.',
  },
  {
    icon: ShieldCheck,
    title: 'Zero Lost Human Edits',
    description:
      'When an AI agent rewrites a section while a teammate types, Yjs relative anchors + three-way merge prevent stale overwrites.',
  },
  {
    icon: GitMerge,
    title: 'Smart Conflict Review',
    description:
      'Non-overlapping edits merge cleanly; overlapping edits surface a 3-way visual diff so humans stay in complete control.',
  },
  {
    icon: Bot,
    title: 'Targeted Gemini AI Agent',
    description:
      'Ask Writing Assistant to rewrite Section 3, fix grammar, or expand a paragraph—without regenerating the whole document.',
  },
  {
    icon: Database,
    title: 'Durable Yjs Snapshots',
    description:
      'Binary CRDT document states persist cleanly to MongoDB, surviving server restarts and client disconnections seamlessly.',
  },
  {
    icon: Layers,
    title: 'Built for Scale',
    description:
      'Architected with room partitioning, Redis Pub/Sub fanout design, and idle room eviction for 20,000+ live documents.',
  },
];

export function LandingPage() {
  const { user } = useAuth();
  const { theme, toggleTheme } = useTheme();

  return (
    <div className="min-h-screen bg-white text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      {/* Navigation */}
      <header className="sticky top-0 z-30 border-b border-slate-200/70 bg-white/85 backdrop-blur-md dark:border-slate-800/80 dark:bg-slate-950/85">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Logo />

          <nav className="hidden items-center gap-7 text-sm font-medium text-slate-600 dark:text-slate-300 md:flex">
            <a href="#preview" className="hover:text-indigo-600 dark:hover:text-indigo-400">
              Live Preview
            </a>
            <a href="#features" className="hover:text-indigo-600 dark:hover:text-indigo-400">
              Capabilities
            </a>
            <a href="#architecture" className="hover:text-indigo-600 dark:hover:text-indigo-400">
              Architecture
            </a>
          </nav>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={toggleTheme}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
              title="Toggle theme"
            >
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>

            {user ? (
              <Link
                to="/dashboard"
                className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700"
              >
                Open Workspace
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            ) : (
              <>
                <Link
                  to="/login"
                  className="rounded-xl px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  Log in
                </Link>
                <Link
                  to="/register"
                  className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700"
                >
                  Get Started
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative overflow-hidden px-4 pb-20 pt-16 sm:px-6 sm:pt-24 lg:px-8">
        <div className="pointer-events-none absolute inset-x-0 -top-40 -z-10 flex justify-center overflow-hidden blur-3xl">
          <div className="h-[340px] w-[760px] rounded-full bg-gradient-to-r from-indigo-500/20 via-violet-500/20 to-cyan-400/20" />
        </div>

        <div className="mx-auto max-w-4xl text-center">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="inline-flex items-center gap-2 rounded-full border border-indigo-200/80 bg-indigo-50/80 px-3.5 py-1 text-xs font-semibold text-indigo-700 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-300"
          >
            <Sparkles className="h-3.5 w-3.5" />
            CRDT-Powered Real-Time Collaboration for Humans & AI Agents
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.06 }}
            className="mt-6 text-4xl font-extrabold tracking-tight text-slate-900 dark:text-white sm:text-6xl"
          >
            Where Humans and AI{' '}
            <span className="bg-gradient-to-r from-indigo-600 via-violet-600 to-cyan-500 bg-clip-text text-transparent">
              Create Together.
            </span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.12 }}
            className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-slate-600 dark:text-slate-400 sm:text-lg"
          >
            Edit shared documents simultaneously with your team while AI agents rewrite sections in parallel—backed by Yjs CRDT synchronization, relative anchoring, and three-way conflict protection so no human edit is ever lost.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.18 }}
            className="mt-9 flex flex-wrap items-center justify-center gap-3.5"
          >
            <Link
              to={user ? '/dashboard' : '/register'}
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-6 py-3 text-sm font-semibold text-white shadow-md shadow-indigo-600/20 transition hover:bg-indigo-700"
            >
              Get Started Free
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              to="/login"
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-6 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Sign In to Workspace
            </Link>
          </motion.div>
        </div>

        {/* Live Collaboration Product Preview */}
        <motion.div
          id="preview"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, delay: 0.25 }}
          className="mx-auto mt-16 max-w-5xl overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900"
        >
          {/* Mock Window Header */}
          <div className="flex items-center justify-between border-b border-slate-200/80 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/90">
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-rose-400" />
              <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
              <span className="ml-3 text-xs font-semibold text-slate-600 dark:text-slate-300">
                Product Architecture Spec.doc
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                Yjs CRDT Synced
              </span>
              <div className="flex -space-x-1.5">
                <span className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-blue-600 text-[10px] font-bold text-white dark:border-slate-900">
                  A
                </span>
                <span className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-emerald-600 text-[10px] font-bold text-white dark:border-slate-900">
                  M
                </span>
                <span className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-violet-600 text-[10px] font-bold text-white dark:border-slate-900">
                  AI
                </span>
              </div>
            </div>
          </div>

          {/* Mock Editor + AI Merge Preview */}
          <div className="grid grid-cols-1 divide-y divide-slate-200/80 dark:divide-slate-800 md:grid-cols-12 md:divide-x md:divide-y-0">
            <div className="p-6 md:col-span-7 sm:p-8">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                Section 3: Real-Time Merge Engine
              </h3>
              <p className="mt-3 text-sm leading-7 text-slate-600 dark:text-slate-300">
                Every connected client edits a shared{' '}
                <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs dark:bg-slate-800">
                  Y.XmlFragment
                </code>{' '}
                using incremental updates.{' '}
                <span className="relative inline-block rounded bg-blue-50 px-1 text-blue-900 dark:bg-blue-500/20 dark:text-blue-200">
                  Maya added latency targets (&lt;50ms p95)
                  <span className="absolute -top-5 left-0 rounded bg-blue-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                    Maya
                  </span>
                </span>{' '}
                while Writing Assistant refined the synchronization protocol in parallel.
              </p>

              <div className="mt-6 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Maya's concurrent edit preserved
                </span>
                <span className="inline-flex items-center gap-1 text-indigo-600 dark:text-indigo-400">
                  <GitMerge className="h-3.5 w-3.5" />
                  3-way merge verified
                </span>
              </div>
            </div>

            <div className="bg-slate-50/70 p-6 dark:bg-slate-950/40 md:col-span-5">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-600 to-violet-600 text-white">
                  <Bot className="h-4 w-4" />
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-900 dark:text-white">
                    Writing Assistant
                  </div>
                  <div className="text-[11px] text-amber-600 dark:text-amber-400">
                    Concurrent edit detected · Safe merge ready
                  </div>
                </div>
              </div>

              <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50/80 p-3 text-xs text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
                <strong>Protected:</strong> Maya edited Section 3 while Gemini was processing. Only non-overlapping AI changes are queued; overlapping spans await your review.
              </div>

              <div className="mt-3 flex gap-2">
                <span className="flex-1 rounded-lg bg-emerald-600 py-1.5 text-center text-xs font-semibold text-white">
                  Apply Safe Merge
                </span>
                <span className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                  Reject
                </span>
              </div>
            </div>
          </div>
        </motion.div>
      </section>

      {/* Features */}
      <section id="features" className="border-t border-slate-200/70 bg-slate-50/60 py-20 dark:border-slate-800 dark:bg-slate-900/30">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white sm:text-3xl">
              Engineered for Concurrent Editing Correctness
            </h2>
            <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">
              Not a toy chat box pasted beside a textarea—SyncSpace AI solves real distributed-systems concurrency between humans and LLMs.
            </p>
          </div>

          <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => {
              const Icon = f.icon;
              return (
                <div
                  key={f.title}
                  className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-400">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="mt-4 text-base font-bold text-slate-900 dark:text-white">
                    {f.title}
                  </h3>
                  <p className="mt-2 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                    {f.description}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Tech Highlights */}
      <section id="architecture" className="py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="rounded-3xl border border-slate-200/80 bg-slate-900 p-8 text-white shadow-xl dark:border-slate-800 sm:p-12">
            <div className="grid grid-cols-1 items-center gap-8 md:grid-cols-2">
              <div>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-500/20 px-3 py-1 text-xs font-semibold text-indigo-300">
                  <Cpu className="h-3.5 w-3.5" />
                  Technology Stack
                </span>
                <h2 className="mt-4 text-2xl font-extrabold sm:text-3xl">
                  Built on Production CRDT & Full-Stack Primitives
                </h2>
                <p className="mt-3 text-sm leading-relaxed text-slate-300">
                  Tiptap + ProseMirror bound directly to Yjs shared types, synchronized over authenticated WebSocket rooms, persisted as binary updates in MongoDB, and augmented with server-side Gemini targeted diffs.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3 text-xs">
                {[
                  ['Yjs CRDT + Awareness', 'Strong eventual consistency & live cursors'],
                  ['Tiptap + ProseMirror', 'Rich-text formatting & collaborative undo'],
                  ['Node.js + Express + ws', 'Authenticated per-document rooms'],
                  ['MongoDB + Mongoose', 'Durable binary snapshots & audit trails'],
                  ['Google Gemini API', 'Server-side structured section rewrites'],
                  ['Three-Way Merge Engine', 'Safe disjoint merges + conflict review UI'],
                ].map(([title, desc]) => (
                  <div key={title} className="rounded-xl border border-white/10 bg-white/5 p-3.5">
                    <div className="flex items-center gap-1.5 font-semibold text-white">
                      <Zap className="h-3.5 w-3.5 text-cyan-400" />
                      {title}
                    </div>
                    <p className="mt-1 text-[11px] text-slate-400">{desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-200/80 py-8 text-center text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-4 sm:flex-row sm:px-6 lg:px-8">
          <Logo />
          <p>SyncSpace AI — Real-Time Collaborative Document Workspace for Humans and AI Agents.</p>
        </div>
      </footer>
    </div>
  );
}
