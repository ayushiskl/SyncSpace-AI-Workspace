import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Clock,
  FilePlus2,
  FileText,
  FolderOpen,
  Loader2,
  LogOut,
  Moon,
  Plus,
  Search,
  Sparkles,
  Sun,
  Trash2,
  Users,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { documentsAPI } from '../services/api';
import { Logo } from '../components/Logo';

export function DashboardPage() {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();

  const [documents, setDocuments] = useState([]);
  const [filter, setFilter] = useState('all'); // all | mine | shared
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  const [newModalOpen, setNewModalOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [seedTemplate, setSeedTemplate] = useState(true);

  const loadDocuments = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await documentsAPI.list({ filter, search });
      setDocuments(data.documents || []);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load documents.');
    } finally {
      setLoading(false);
    }
  }, [filter, search]);

  useEffect(() => {
    const timer = setTimeout(loadDocuments, 180);
    return () => clearTimeout(timer);
  }, [loadDocuments]);

  const handleCreateDocument = async (e) => {
    e?.preventDefault();
    setCreating(true);
    setError('');
    try {
      const data = await documentsAPI.create({
        title: newTitle.trim() || 'Untitled Document',
        seedTemplate,
      });
      setNewModalOpen(false);
      setNewTitle('');
      navigate(`/documents/${data.document.id}`);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not create document.');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (e, docId, docTitle) => {
    e.preventDefault();
    e.stopPropagation();
    if (!window.confirm(`Delete "${docTitle}" permanently?`)) return;
    try {
      await documentsAPI.remove(docId);
      setDocuments((prev) => prev.filter((d) => d.id !== docId));
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to delete document.');
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      {/* Top Navbar */}
      <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/90 backdrop-blur dark:border-slate-800 dark:bg-slate-900/90">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link to="/dashboard">
            <Logo />
          </Link>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => setNewModalOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-indigo-700"
            >
              <Plus className="h-4 w-4" />
              New Document
            </button>

            <button
              type="button"
              onClick={toggleTheme}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              title="Toggle theme"
            >
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>

            <div className="hidden items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1.5 dark:border-slate-800 dark:bg-slate-800/60 sm:flex">
              <div
                className="flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold text-white"
                style={{ backgroundColor: user?.cursorColor || '#4F46E5' }}
              >
                {(user?.name || 'U')[0].toUpperCase()}
              </div>
              <span className="max-w-[120px] truncate text-xs font-medium text-slate-700 dark:text-slate-200">
                {user?.name}
              </span>
            </div>

            <button
              type="button"
              onClick={() => {
                logout();
                navigate('/');
              }}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10 dark:hover:text-rose-400"
              title="Log out"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Welcome Hero Card */}
        <section className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-6 shadow-soft dark:border-slate-800 dark:bg-slate-900 sm:p-8">
          <div className="flex flex-col justify-between gap-6 md:flex-row md:items-center">
            <div>
              <div className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300">
                <Sparkles className="h-3.5 w-3.5" />
                Real-Time Human + AI Workspace
              </div>
              <h1 className="mt-3 text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white sm:text-3xl">
                Welcome back, {user?.name?.split(' ')[0]}
              </h1>
              <p className="mt-1.5 max-w-xl text-sm text-slate-500 dark:text-slate-400">
                Create collaborative documents powered by Yjs CRDTs and a conflict-aware Gemini Writing Assistant that protects concurrent human edits.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => setNewModalOpen(true)}
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:opacity-95"
              >
                <FilePlus2 className="h-4 w-4" />
                Create New Document
              </button>
            </div>
          </div>
        </section>

        {/* Filters + Search Bar */}
        <section className="mt-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1 dark:border-slate-800 dark:bg-slate-900">
            {[
              { id: 'all', label: 'Recent & All' },
              { id: 'mine', label: 'My Documents' },
              { id: 'shared', label: 'Shared with Me' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFilter(tab.id)}
                className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition ${
                  filter === tab.id
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="relative w-full sm:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search documents..."
              className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-xs text-slate-800 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/15 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
            />
          </div>
        </section>

        {error && (
          <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
            {error}
          </div>
        )}

        {/* Documents Grid */}
        <section className="mt-6">
          {loading ? (
            <div className="flex items-center justify-center py-20 text-sm text-slate-500">
              <Loader2 className="mr-2 h-4 w-4 animate-spin text-indigo-600" />
              Loading documents...
            </div>
          ) : documents.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center dark:border-slate-700 dark:bg-slate-900">
              <FolderOpen className="mx-auto h-10 w-10 text-slate-300 dark:text-slate-600" />
              <h3 className="mt-4 text-base font-bold text-slate-900 dark:text-white">
                No documents found
              </h3>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                {search
                  ? 'Try a different search query.'
                  : 'Create your first collaborative document to get started.'}
              </p>
              <button
                type="button"
                onClick={() => setNewModalOpen(true)}
                className="mt-5 inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700"
              >
                <Plus className="h-4 w-4" />
                Create Document
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {documents.map((doc) => {
                const isOwner = doc.userRole === 'owner';
                return (
                  <Link
                    key={doc.id}
                    to={`/documents/${doc.id}`}
                    className="group flex flex-col justify-between rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-card dark:border-slate-800 dark:bg-slate-900 dark:hover:border-indigo-500/40"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-400">
                          <FileText className="h-5 w-5" />
                        </div>

                        <div className="flex items-center gap-1.5">
                          {doc.activeUsers?.length > 0 && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                              {doc.activeUsers.length} live
                            </span>
                          )}
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold capitalize text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                            {doc.userRole}
                          </span>
                          {isOwner && (
                            <button
                              type="button"
                              onClick={(e) => handleDelete(e, doc.id, doc.title)}
                              className="rounded-md p-1 text-slate-400 opacity-0 transition hover:bg-rose-50 hover:text-rose-600 group-hover:opacity-100 dark:hover:bg-rose-500/10"
                              title="Delete document"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </div>

                      <h3 className="mt-4 truncate text-base font-bold text-slate-900 group-hover:text-indigo-600 dark:text-white dark:group-hover:text-indigo-400">
                        {doc.title}
                      </h3>

                      <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                        {doc.excerpt || 'Empty document — click to start writing together.'}
                      </p>
                    </div>

                    <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-3.5 text-[11px] text-slate-500 dark:border-slate-800 dark:text-slate-400">
                      <div className="flex items-center gap-1.5 truncate">
                        <div
                          className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
                          style={{ backgroundColor: doc.ownerId?.cursorColor || '#4F46E5' }}
                        >
                          {(doc.ownerId?.name || 'U')[0].toUpperCase()}
                        </div>
                        <span className="truncate">{doc.ownerId?.name || 'Owner'}</span>
                        {doc.collaborators?.length > 0 && (
                          <span className="inline-flex items-center gap-0.5 text-slate-400">
                            · <Users className="h-3 w-3" /> {doc.collaborators.length + 1}
                          </span>
                        )}
                      </div>

                      <span className="inline-flex shrink-0 items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {new Date(doc.updatedAt).toLocaleDateString([], {
                          month: 'short',
                          day: 'numeric',
                        })}
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </section>
      </main>

      {/* Create Document Modal */}
      {newModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
          <form
            onSubmit={handleCreateDocument}
            className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900"
          >
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              Create New Document
            </h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Start with a structured 3-section template or a blank canvas.
            </p>

            <div className="mt-4">
              <label className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Document Title
              </label>
              <input
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="e.g. Q4 Product Architecture Spec"
                autoFocus
                className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
              />
            </div>

            <label className="mt-4 flex cursor-pointer items-start gap-2.5 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-800/40">
              <input
                type="checkbox"
                checked={seedTemplate}
                onChange={(e) => setSeedTemplate(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              />
              <div>
                <div className="text-xs font-semibold text-slate-800 dark:text-slate-100">
                  Include 3-Section Starter Template
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                  Pre-populates Sections 1–3 so you can immediately demo "Rewrite section 3" with concurrent editing.
                </div>
              </div>
            </label>

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setNewModalOpen(false)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={creating}
                className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {creating && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Create & Open
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
