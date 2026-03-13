import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

const api = axios.create({
    baseURL: API_BASE,
    headers: {
        'Content-Type': 'application/json',
    },
});

// Interceptor to add Auth Token
api.interceptors.request.use((config) => {
    const token = localStorage.getItem('token');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

// Response Interceptor for 401
api.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response?.status === 401) {
            localStorage.removeItem('token');
            localStorage.removeItem('role');
            localStorage.removeItem('email');

            // Only redirect if we are not already on the login page
            // and the request wasn't the login request itself
            const isAuthReq = error.config?.url?.includes('/auth/login');
            if (window.location.pathname !== '/login' && !isAuthReq) {
                window.location.href = '/login';
            }
        }
        return Promise.reject(error);
    }
);

// Auth Services
export const authService = {
    login: (formData: FormData) => api.post('/auth/login', formData, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    }),
    register: (data: any) => api.post('/auth/register', data),
    googleSSO: () => api.get('/auth/google'),
};

// Document Services
export const documentService = {
    upload: (formData: FormData) => api.post('/documents/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
    }),
    getJobStatus: (jobId: string) => api.get(`/documents/jobs/${jobId}`),
    pollJobUntilDone: async (jobId: string, intervalMs = 2000, timeoutMs = 120000): Promise<any> => {
        const start = Date.now();
        while (Date.now() - start < timeoutMs) {
            const res = await api.get(`/documents/jobs/${jobId}`);
            if (res.data.status === 'done' || res.data.status === 'failed') {
                return res.data;
            }
            await new Promise(resolve => setTimeout(resolve, intervalMs));
        }
        throw new Error('Ingestion timed out after 2 minutes.');
    },
    getAll: () => api.get('/documents'),
    delete: (id: string) => api.delete(`/documents/${id}`),
};

// Query Services
export const queryService = {
    ask: (data: { question: string; provider: string; chat_history?: any[] }) =>
        api.post('/query', data),
};

// Admin Services
export const adminService = {
    getStats: () => api.get('/admin/stats'),
    checkHealth: () => api.get('/health'),
    // User Management
    listUsers: () => api.get('/admin/users'),
    updateUser: (id: string, data: { role?: string; is_active?: boolean }) =>
        api.patch(`/admin/users/${id}`, data),
    deleteUser: (id: string) => api.delete(`/admin/users/${id}`),
    getTimeSeriesStats: (period: string) => api.get(`/admin/stats/time-series?period=${period}`),
};

// Room / Multiplayer Services
export const roomService = {
    // If documentId is empty, it creates a generic Global Room
    createRoom: (documentId: string, name: string) =>
        api.post(`/rooms?${documentId ? `document_id=${documentId}&` : ''}name=${encodeURIComponent(name)}`),
    getHistory: (roomId: string) => api.get(`/rooms/${roomId}/history`),
    getUserRooms: () => api.get(`/user/rooms`),
    addDocumentToRoom: (roomId: string, documentId: string) =>
        api.post(`/rooms/${roomId}/documents?document_id=${documentId}`),
    getRoomDocuments: (roomId: string) => api.get(`/rooms/${roomId}/documents`),
    leaveRoom: (roomId: string) => api.delete(`/rooms/${roomId}/leave`)
};

export const connectorService = {
    getGoogleAuthUrl: () => api.get('/connectors/google/auth'),
    listConnections: () => api.get('/connectors'),
    listDriveFiles: () => api.get('/connectors/google/files'),
    syncGoogle: (fileIds: string[]) => api.post('/connectors/google/sync', { file_ids: fileIds }),
    getNotionAuthUrl: () => api.get('/connectors/notion/auth'),
    listNotionPages: () => api.get('/connectors/notion/files'),
    syncNotion: (fileIds: string[]) => api.post('/connectors/notion/sync', { file_ids: fileIds }),
    // Slack
    getSlackAuthUrl: () => api.get('/connectors/slack/auth'),
    listSlackChannels: () => api.get('/connectors/slack/files'),
    syncSlack: (fileIds: string[]) => api.post('/connectors/slack/sync', { file_ids: fileIds }),
    // GitHub
    getGitHubAuthUrl: () => api.get('/connectors/github/auth'),
    listGitHubFiles: () => api.get('/connectors/github/files'),
    syncGitHub: (fileIds: string[]) => api.post('/connectors/github/sync', { file_ids: fileIds }),
    disconnect: (accountId: string) => api.delete(`/connectors/${accountId}`),
};


export default api;
