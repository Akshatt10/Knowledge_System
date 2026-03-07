import axios from 'axios';

const API_BASE = 'http://localhost:8000/api';

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

// Auth Services
export const authService = {
    login: (formData: FormData) => api.post('/auth/login', formData, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    }),
    register: (data: any) => api.post('/auth/register', data),
};

// Document Services
export const documentService = {
    upload: (formData: FormData) => api.post('/documents/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
    }),
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
};

export default api;
