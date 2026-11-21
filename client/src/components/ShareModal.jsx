import React, { useState } from 'react';
import { Check, Copy, Globe, Lock, Trash2, UserPlus, X } from 'lucide-react';
import { documentsAPI } from '../services/api';

export function ShareModal({ document, onClose, onUpdated }) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('editor');
  const [publicAccess, setPublicAccess] = useState(document?.permissions?.publicAccess || 'none');
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  if (!document) return null;

  const isOwner = document.userRole === 'owner';
  const shareUrl = `${window.location.origin}/documents/${document.id}`;

  const copyLink = async () => {
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleInvite = async (e) => {
    e.preventDefault();
    if (!email.trim()) return;
    setSaving(true);
    setError('');
    setSuccessMsg('');
    try {
      const data = await documentsAPI.update(document.id, {
        addCollaboratorEmail: email.trim(),
        collaboratorRole: role,
      });
      setEmail('');
      setSuccessMsg('Collaborator added!');
      onUpdated?.(data.document);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to add collaborator.');
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveCollaborator = async (userId) => {
    setSaving(true);
    setError('');
    try {
      const data = await documentsAPI.update(document.id, {
        removeCollaboratorId: userId,
      });
      onUpdated?.(data.document);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to remove collaborator.');
    } finally {
      setSaving(false);
    }
  };

  const handlePublicAccessChange = async (newAccess) => {
    setPublicAccess(newAccess);
    setSaving(true);
    setError('');
    try {
      const data = await documentsAPI.update(document.id, {
        permissions: { publicAccess: newAccess },
      });
      onUpdated?.(data.document);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update access settings.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              Share "{document.title}"
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Collaborate in real time with live cursors and AI protection
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Invite form */}
        {isOwner && (
          <form onSubmit={handleInvite} className="mt-5">
            <label className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-300">
              Invite teammate by email
            </label>
            <div className="flex gap-2">
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="teammate@company.com"
                className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
              />
              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
              >
                <option value="editor">Editor</option>
                <option value="viewer">Viewer</option>
              </select>
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                <UserPlus className="h-3.5 w-3.5" />
                Invite
              </button>
            </div>
          </form>
        )}

        {error && (
          <p className="mt-2.5 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
            {error}
          </p>
        )}
        {successMsg && (
          <p className="mt-2.5 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
            {successMsg}
          </p>
        )}

        {/* People with access */}
        <div className="mt-5">
          <div className="mb-2 text-xs font-semibold text-slate-700 dark:text-slate-300">
            People with access
          </div>
          <div className="max-h-44 space-y-2 overflow-y-auto">
            {document.ownerId && (
              <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-800/60">
                <div className="flex items-center gap-2.5">
                  <div
                    className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold text-white"
                    style={{ backgroundColor: document.ownerId.cursorColor || '#4F46E5' }}
                  >
                    {(document.ownerId.name || 'O')[0].toUpperCase()}
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-900 dark:text-white">
                      {document.ownerId.name}
                    </p>
                    <p className="text-[11px] text-slate-500">{document.ownerId.email}</p>
                  </div>
                </div>
                <span className="rounded bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300">
                  Owner
                </span>
              </div>
            )}

            {(document.collaborators || []).map((c) => {
              const u = c.userId || {};
              return (
                <div
                  key={u._id || u.id}
                  className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2 dark:border-slate-800"
                >
                  <div className="flex items-center gap-2.5">
                    <div
                      className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold text-white"
                      style={{ backgroundColor: u.cursorColor || '#059669' }}
                    >
                      {(u.name || 'U')[0].toUpperCase()}
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-slate-900 dark:text-white">{u.name}</p>
                      <p className="text-[11px] text-slate-500">{u.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] font-medium capitalize text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                      {c.role}
                    </span>
                    {isOwner && (
                      <button
                        type="button"
                        onClick={() => handleRemoveCollaborator(u._id || u.id)}
                        className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10"
                        title="Remove collaborator"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Link Access */}
        <div className="mt-5 flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50/80 p-3 dark:border-slate-800 dark:bg-slate-800/40">
          <div className="flex items-center gap-2.5">
            {publicAccess === 'none' ? (
              <Lock className="h-4 w-4 text-slate-500" />
            ) : (
              <Globe className="h-4 w-4 text-emerald-600" />
            )}
            <div>
              <p className="text-xs font-semibold text-slate-800 dark:text-slate-100">
                Workspace Link Access
              </p>
              <p className="text-[11px] text-slate-500">
                {publicAccess === 'none'
                  ? 'Only invited people can open'
                  : publicAccess === 'view'
                    ? 'Any signed-in user with link can view'
                    : 'Any signed-in user with link can edit'}
              </p>
            </div>
          </div>

          {isOwner && (
            <select
              value={publicAccess}
              onChange={(e) => handlePublicAccessChange(e.target.value)}
              disabled={saving}
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
            >
              <option value="none">Restricted</option>
              <option value="view">Signed-in View</option>
              <option value="edit">Signed-in Edit</option>
            </select>
          )}
        </div>

        {/* Copy link footer */}
        <div className="mt-5 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={copyLink}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? 'Link Copied!' : 'Copy Document Link'}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 dark:bg-white dark:text-slate-900"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
