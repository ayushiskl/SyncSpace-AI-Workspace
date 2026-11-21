import { useEffect, useState } from 'react';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { WS_BASE_URL } from '../services/api';

/**
 * Manages the Yjs CRDT Y.Doc, authenticated y-websocket provider, live awareness
 * (active collaborators + live AI agent status), and sync status for a document room.
 * Safe under React 18 StrictMode (creates fresh Y.Doc + Provider per mount lifecycle).
 */
export function useCollaboration(documentId, user, token) {
  const [collab, setCollab] = useState(null);
  const [status, setStatus] = useState('connecting'); // connecting | synced | reconnecting | disconnected
  const [isSynced, setIsSynced] = useState(false);
  const [collaborators, setCollaborators] = useState([]);
  const [aiPresence, setAiPresence] = useState(null);
  const [lastSyncedAt, setLastSyncedAt] = useState(null);

  useEffect(() => {
    if (!documentId || !token) {
      setCollab(null);
      return undefined;
    }

    const ydoc = new Y.Doc();
    const provider = new WebsocketProvider(WS_BASE_URL, documentId, ydoc, {
      params: { token },
      connect: true,
    });

    setCollab({ ydoc, provider });
    setStatus('connecting');
    setIsSynced(false);

    const handleStatus = ({ status: wsStatus }) => {
      if (wsStatus === 'connected') {
        setStatus(provider.synced ? 'synced' : 'connecting');
      } else if (wsStatus === 'connecting') {
        setStatus('reconnecting');
      } else {
        setStatus('disconnected');
        setIsSynced(false);
      }
    };

    const handleSync = (synced) => {
      setIsSynced(synced);
      if (synced) {
        setStatus('synced');
        setLastSyncedAt(new Date());
      }
    };

    const handleDocUpdate = () => {
      if (provider.synced) {
        setLastSyncedAt(new Date());
      }
    };

    const updateAwarenessList = () => {
      const states = provider.awareness.getStates();
      const usersMap = new Map();
      let activeAI = null;

      states.forEach((state, clientId) => {
        if (!state?.user) return;
        if (state.user.isAI) {
          activeAI = { ...state.user, clientId };
          return;
        }
        const key = state.user.id || String(clientId);
        usersMap.set(key, {
          ...state.user,
          clientId,
          isLocal: clientId === provider.awareness.clientID,
        });
      });

      setCollaborators(Array.from(usersMap.values()));
      setAiPresence(activeAI);
    };

    provider.on('status', handleStatus);
    provider.on('sync', handleSync);
    provider.awareness.on('change', updateAwarenessList);
    ydoc.on('update', handleDocUpdate);
    updateAwarenessList();

    return () => {
      provider.off('status', handleStatus);
      provider.off('sync', handleSync);
      provider.awareness.off('change', updateAwarenessList);
      ydoc.off('update', handleDocUpdate);
      provider.destroy();
      ydoc.destroy();
      setCollab(null);
    };
  }, [documentId, token]);

  useEffect(() => {
    if (!collab?.provider || !user) return;
    collab.provider.awareness.setLocalStateField('user', {
      id: user.id,
      name: user.name,
      email: user.email,
      color: user.cursorColor || '#4F46E5',
      isAI: false,
    });
  }, [collab, user]);

  return {
    ydoc: collab?.ydoc || null,
    provider: collab?.provider || null,
    status,
    isSynced,
    collaborators,
    aiPresence,
    lastSyncedAt,
  };
}
