import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  Activity as ActivityIcon,
  ArrowLeft,
  Bot,
  Check,
  Cloud,
  CloudOff,
  FileText,
  ListTree,
  Loader2,
  Moon,
  PanelLeft,
  PanelRight,
  RefreshCw,
  Save,
  Share2,
  Sun,
  Users,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { aiAPI, documentsAPI } from '../services/api';
import { useCollaboration } from '../collaboration/useCollaboration';
import { CollaborativeEditor } from '../editor/CollaborativeEditor';
import { AIAssistantPanel } from '../ai/AIAssistantPanel';
import { ShareModal } from '../components/ShareModal';
import { Logo } from '../components/Logo';

export function DocumentWorkspacePage() {
  const { id: documentId } = useParams();
  const navigate = useNavigate();
  const { user, token } = useAuth();
  const { theme, toggleTheme } = useTheme();

  const [document, setDocument] = useState(null);
  const [titleInput, setTitleInput] = useState('');
  const [loadingDoc, setLoadingDoc] = useState(true);
  const [docError, setDocError] = useState('');

  const [outline, setOutline] = useState([]);
  const [selectedText, setSelectedText] = useState('');
  const [executions, setExecutions] = useState([]);
  const [activities, setActivities] = useState([]);

  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const [leftTab, setLeftTab] = useState('outline'); // outline | activity | info
  const [shareOpen, setShareOpen] = useState(false);
  const [savingSnapshot, setSavingSnapshot] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  const editorRef = useRef(null);

  const { ydoc, provider, status, isSynced, collaborators, aiPresence, lastSyncedAt } =
    useCollaboration(documentId, user, token);

  const fetchDocument = useCallback(async () => {
    try {
      const data = await documentsAPI.get(documentId);
      setDocument(data.document);
      setTitleInput(data.document.title);
      setDocError('');
    } catch (err) {
      setDocError(err.response?.data?.message || 'Unable to load this document.');
    } finally {
      setLoadingDoc(false);
    }
  }, [documentId]);

  const fetchExecutions = useCallback(async () => {
    try {
      const data = await aiAPI.listExecutions(documentId);
      setExecutions(data.executions || []);
    } catch {
      // ignore transient error
    }
  }, [documentId]);

  const fetchActivity = useCallback(async () => {
    try {
      const data = await documentsAPI.getActivity(documentId);
      setActivities(data.activities || []);
    } catch {
      // ignore
    }
  }, [documentId]);

  useEffect(() => {
    fetchDocument();
    fetchExecutions();
    fetchActivity();
  }, [fetchDocument, fetchExecutions, fetchActivity]);

  const readOnly = document?.userRole === 'viewer';

  const handleTitleBlur = async () => {
    const trimmed = titleInput.trim();
    if (!trimmed || !document || trimmed === document.title || readOnly) return;
    try {
      const data = await documentsAPI.update(document.id, { title: trimmed });
      setDocument(data.document);
      fetchActivity();
    } catch {
      setTitleInput(document.title);
    }
  };

  const handleSaveSnapshot = async () => {
    if (readOnly || savingSnapshot) return;
    setSavingSnapshot(true);
    try {
      await documentsAPI.saveSnapshot(documentId);
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 2000);
      fetchActivity();
    } finally {
      setSavingSnapshot(false);
    }
  };

  const scrollToHeading = (pos) => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.chain().focus().setTextSelection(pos + 1).scrollIntoView().run();
  };

  if (loadingDoc) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50 dark:bg-slate-950">
        <div className="flex items-center gap-2.5 text-sm font-medium text-slate-600 dark:text-slate-300">
          <Loader2 className="h-4 w-4 animate-spin text-indigo-600" />
          Connecting to live CRDT workspace...
        </div>
      </div>
    );
  }

  if (docError || !document) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-slate-50 p-6 text-center dark:bg-slate-950">
        <div className="max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-soft dark:border-slate-800 dark:bg-slate-900">
          <FileText className="mx-auto h-10 w-10 text-slate-400" />
          <h2 className="mt-4 text-lg font-bold text-slate-900 dark:text-white">
            Document unavailable
          </h2>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            {docError || 'This document does not exist or you do not have permission to open it.'}
          </p>
          <button
            type="button"
            onClick={() => navigate('/dashboard')}
            className="mt-6 inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-slate-50 dark:bg-slate-950">
      {/* Top Workspace Bar */}
      <header className="z-20 flex h-14 shrink-0 items-center justify-between border-b border-slate-200/80 bg-white px-3 dark:border-slate-800 dark:bg-slate-900 sm:px-4">
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <Link
            to="/dashboard"
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
            title="Back to Dashboard"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>

          <Link to="/dashboard" className="hidden sm:inline-flex">
            <Logo compact />
          </Link>

          <div className="h-5 w-px bg-slate-200 dark:bg-slate-700" />

          <input
            type="text"
            value={titleInput}
            onChange={(e) => setTitleInput(e.target.value)}
            onBlur={handleTitleBlur}
            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
            readOnly={readOnly}
            aria-label="Document Title"
            className="w-40 truncate rounded-md px-2 py-1 text-sm font-semibold text-slate-900 transition hover:bg-slate-100 focus:bg-slate-100 focus:outline-none dark:text-white dark:hover:bg-slate-800 dark:focus:bg-slate-800 sm:w-64"
          />

          {/* Live Sync Indicator */}
          <div className="hidden items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium dark:border-slate-700 dark:bg-slate-800 md:inline-flex">
            {status === 'synced' && isSynced ? (
              <>
                <Cloud className="h-3.5 w-3.5 text-emerald-500" />
                <span className="text-slate-600 dark:text-slate-300">
                  Synced {lastSyncedAt ? `· ${lastSyncedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}
                </span>
              </>
            ) : status === 'disconnected' ? (
              <>
                <CloudOff className="h-3.5 w-3.5 text-rose-500" />
                <span className="text-rose-600 dark:text-rose-400">Offline (reconnecting)</span>
              </>
            ) : (
              <>
                <RefreshCw className="h-3.5 w-3.5 animate-spin text-amber-500" />
                <span className="text-amber-700 dark:text-amber-300">Syncing...</span>
              </>
            )}
          </div>
        </div>

        {/* Right Controls: Live AI pill, Active Collaborators, Actions */}
        <div className="flex items-center gap-2">
          {aiPresence && (
            <div className="hidden items-center gap-1.5 rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-[11px] font-semibold text-violet-700 dark:border-violet-500/30 dark:bg-violet-500/15 dark:text-violet-300 lg:inline-flex">
              <Bot className="h-3.5 w-3.5 animate-pulse" />
              AI working on {aiPresence.targetLabel || 'document'}
            </div>
          )}

          {/* Active Collaborator Avatars */}
          <div className="flex items-center -space-x-1.5 pr-1">
            {collaborators.slice(0, 5).map((collab) => (
              <div
                key={collab.clientId}
                title={`${collab.name}${collab.isLocal ? ' (You)' : ''} · Online`}
                className="relative flex h-7 w-7 items-center justify-center rounded-full border-2 border-white text-[11px] font-bold text-white shadow-sm dark:border-slate-900"
                style={{ backgroundColor: collab.color || '#4F46E5' }}
              >
                {(collab.name || 'U')[0].toUpperCase()}
                <span className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full border border-white bg-emerald-400 dark:border-slate-900" />
              </div>
            ))}
            {collaborators.length > 5 && (
              <div className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-slate-200 text-[10px] font-bold text-slate-700 dark:border-slate-900 dark:bg-slate-700 dark:text-slate-200">
                +{collaborators.length - 5}
              </div>
            )}
          </div>

          {!readOnly && (
            <button
              type="button"
              onClick={handleSaveSnapshot}
              disabled={savingSnapshot}
              title="Save durable Yjs snapshot to MongoDB"
              className="hidden items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 sm:inline-flex"
            >
              {savedFlash ? (
                <>
                  <Check className="h-3.5 w-3.5 text-emerald-500" />
                  Saved
                </>
              ) : (
                <>
                  <Save className="h-3.5 w-3.5" />
                  Snapshot
                </>
              )}
            </button>
          )}

          <button
            type="button"
            onClick={() => setShareOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-indigo-700"
          >
            <Share2 className="h-3.5 w-3.5" />
            Share
          </button>

          <button
            type="button"
            onClick={toggleTheme}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
            title="Toggle theme"
          >
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>

          <button
            type="button"
            onClick={() => setLeftOpen((v) => !v)}
            className={`inline-flex h-8 w-8 items-center justify-center rounded-lg transition ${
              leftOpen
                ? 'bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-white'
                : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
            title="Toggle Document Outline"
          >
            <PanelLeft className="h-4 w-4" />
          </button>

          <button
            type="button"
            onClick={() => setRightOpen((v) => !v)}
            className={`inline-flex h-8 w-8 items-center justify-center rounded-lg transition ${
              rightOpen
                ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300'
                : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
            title="Toggle AI Assistant Panel"
          >
            <PanelRight className="h-4 w-4" />
          </button>
        </div>
      </header>

      {/* Main 3-Pane Workspace */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Left Sidebar: Outline, Presence & Activity */}
        {leftOpen && (
          <aside className="hidden w-64 shrink-0 flex-col border-r border-slate-200/80 bg-white dark:border-slate-800 dark:bg-slate-900 lg:flex">
            <div className="flex border-b border-slate-200/80 p-2 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setLeftTab('outline')}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-semibold transition ${
                  leftTab === 'outline'
                    ? 'bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-white'
                    : 'text-slate-500 hover:text-slate-800 dark:text-slate-400'
                }`}
              >
                <ListTree className="h-3.5 w-3.5" />
                Outline
              </button>
              <button
                type="button"
                onClick={() => setLeftTab('activity')}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-semibold transition ${
                  leftTab === 'activity'
                    ? 'bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-white'
                    : 'text-slate-500 hover:text-slate-800 dark:text-slate-400'
                }`}
              >
                <ActivityIcon className="h-3.5 w-3.5" />
                Activity
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-3.5">
              {leftTab === 'outline' ? (
                <div className="space-y-4">
                  <div>
                    <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                      Document Outline
                    </div>
                    {outline.length === 0 ? (
                      <p className="text-xs text-slate-400">
                        Add headings (H1–H3) to generate an interactive outline.
                      </p>
                    ) : (
                      <nav className="space-y-0.5">
                        {outline.map((h) => (
                          <button
                            key={h.id}
                            type="button"
                            onClick={() => scrollToHeading(h.pos)}
                            className={`block w-full truncate rounded-md px-2 py-1.5 text-left text-xs transition hover:bg-slate-100 dark:hover:bg-slate-800 ${
                              h.level === 1
                                ? 'font-bold text-slate-900 dark:text-white'
                                : h.level === 2
                                  ? 'pl-3.5 font-medium text-slate-700 dark:text-slate-300'
                                  : 'pl-6 text-slate-500 dark:text-slate-400'
                            }`}
                          >
                            {h.text}
                          </button>
                        ))}
                      </nav>
                    )}
                  </div>

                  {/* Active Collaborators List */}
                  <div className="border-t border-slate-100 pt-4 dark:border-slate-800">
                    <div className="mb-2 flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                      <span className="inline-flex items-center gap-1.5">
                        <Users className="h-3 w-3" />
                        Online Now
                      </span>
                      <span>{collaborators.length}</span>
                    </div>
                    <div className="space-y-1.5">
                      {collaborators.map((c) => (
                        <div key={c.clientId} className="flex items-center gap-2 rounded-lg px-2 py-1">
                          <span
                            className="h-2.5 w-2.5 shrink-0 rounded-full"
                            style={{ backgroundColor: c.color || '#4F46E5' }}
                          />
                          <span className="truncate text-xs font-medium text-slate-700 dark:text-slate-200">
                            {c.name} {c.isLocal ? '(You)' : ''}
                          </span>
                        </div>
                      ))}
                      {aiPresence && (
                        <div className="flex items-center gap-2 rounded-lg bg-violet-50 px-2 py-1.5 dark:bg-violet-500/15">
                          <Bot className="h-3.5 w-3.5 shrink-0 text-violet-600 dark:text-violet-400" />
                          <span className="truncate text-xs font-semibold text-violet-700 dark:text-violet-300">
                            Writing Assistant (Active)
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-2.5">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    Recent Activity
                  </div>
                  {activities.length === 0 ? (
                    <p className="text-xs text-slate-400">No recorded events yet.</p>
                  ) : (
                    activities.map((a) => (
                      <div
                        key={a.id}
                        className="rounded-lg border border-slate-100 bg-slate-50/70 p-2.5 text-xs dark:border-slate-800 dark:bg-slate-800/40"
                      >
                        <p className="leading-snug text-slate-700 dark:text-slate-200">{a.description}</p>
                        <p className="mt-1 text-[10px] text-slate-400">
                          {new Date(a.timestamp).toLocaleString([], {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </aside>
        )}

        {/* Center Main Editor */}
        <main className="min-w-0 flex-1 overflow-hidden">
          {ydoc && provider ? (
            <CollaborativeEditor
              ydoc={ydoc}
              provider={provider}
              user={user}
              readOnly={readOnly}
              selectedText={selectedText}
              onOutlineChange={setOutline}
              onSelectionChange={setSelectedText}
              onEditorReady={(ed) => {
                editorRef.current = ed;
              }}
              onAskAISelection={() => setRightOpen(true)}
            />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-slate-500">
              <Loader2 className="mr-2 h-4 w-4 animate-spin text-indigo-600" />
              Initializing collaborative CRDT engine...
            </div>
          )}
        </main>

        {/* Right AI Assistant Panel */}
        {rightOpen && (
          <div className="w-80 shrink-0 xl:w-96">
            <AIAssistantPanel
              documentId={documentId}
              readOnly={readOnly}
              selectedText={selectedText}
              outline={outline}
              aiPresence={aiPresence}
              executions={executions}
              onExecutionsChanged={fetchExecutions}
              onActivityChanged={fetchActivity}
            />
          </div>
        )}
      </div>

      {shareOpen && (
        <ShareModal
          document={document}
          onClose={() => setShareOpen(false)}
          onUpdated={(updated) => {
            setDocument(updated);
            fetchActivity();
          }}
        />
      )}
    </div>
  );
}
