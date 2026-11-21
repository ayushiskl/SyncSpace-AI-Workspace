import axios from 'axios';

export const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
export const WS_BASE_URL =
  import.meta.env.VITE_WS_URL ||
  `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.hostname}:5000/yjs`;

export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('syncspace_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401 && localStorage.getItem('syncspace_token')) {
      // Only clear if token is genuinely invalid on /auth/me or protected routes
      const url = err.config?.url || '';
      if (!url.includes('/auth/login') && !url.includes('/auth/register')) {
        localStorage.removeItem('syncspace_token');
      }
    }
    return Promise.reject(err);
  }
);

export const authAPI = {
  register: (payload) => api.post('/auth/register', payload).then((r) => r.data),
  login: (payload) => api.post('/auth/login', payload).then((r) => r.data),
  me: () => api.get('/auth/me').then((r) => r.data),
};

export const documentsAPI = {
  list: (params = {}) => api.get('/documents', { params }).then((r) => r.data),
  create: (payload) => api.post('/documents', payload).then((r) => r.data),
  get: (id) => api.get(`/documents/${id}`).then((r) => r.data),
  update: (id, payload) => api.patch(`/documents/${id}`, payload).then((r) => r.data),
  remove: (id) => api.delete(`/documents/${id}`).then((r) => r.data),
  getSnapshot: (id) => api.get(`/documents/${id}/snapshot`).then((r) => r.data),
  saveSnapshot: (id) => api.post(`/documents/${id}/snapshot`).then((r) => r.data),
  getActivity: (id) => api.get(`/documents/${id}/activity`).then((r) => r.data),
};

export const aiAPI = {
  rewrite: (payload) => api.post('/ai/rewrite', payload).then((r) => r.data),
  summarize: (payload) => api.post('/ai/summarize', payload).then((r) => r.data),
  improve: (payload) => api.post('/ai/improve', payload).then((r) => r.data),
  execute: (payload) => api.post('/ai/execute', payload).then((r) => r.data),
  listExecutions: (documentId) => api.get(`/ai/executions/${documentId}`).then((r) => r.data),
  liveCheck: (executionId) => api.get(`/ai/executions/${executionId}/live-check`).then((r) => r.data),
  apply: (executionId, payload = {}) =>
    api.post(`/ai/executions/${executionId}/apply`, payload).then((r) => r.data),
  reject: (executionId) => api.post(`/ai/executions/${executionId}/reject`).then((r) => r.data),
};
