import axios from 'axios';
import toast from 'react-hot-toast';

const api = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const message = error.response?.data?.error || 'An error occurred';

    if (error.response?.status === 401) {
      // Clear auth state on unauthorized
      localStorage.removeItem('kb-auth');
      window.location.href = '/login';
      toast.error('Session expired. Please login again.');
    } else if (error.response?.status === 403) {
      toast.error('You do not have permission to perform this action');
    } else if (error.response?.status >= 500) {
      toast.error('Server error. Please try again later.');
    } else {
      toast.error(message);
    }

    return Promise.reject(error);
  }
);

// API helper functions
export const issuesApi = {
  getAll: (params) => api.get('/issues', { params }),
  getOne: (id) => api.get(`/issues/${id}`),
  create: (data) => api.post('/issues', data),
  update: (id, data) => api.put(`/issues/${id}`, data),
  delete: (id) => api.delete(`/issues/${id}`),
  getHistory: (id) => api.get(`/issues/${id}/history`),
  watch: (id) => api.post(`/issues/${id}/watch`),
};

export const solutionsApi = {
  getForIssue: (issueId) => api.get(`/solutions/issue/${issueId}`),
  create: (data) => api.post('/solutions', data),
  update: (id, data) => api.put(`/solutions/${id}`, data),
  delete: (id) => api.delete(`/solutions/${id}`),
  accept: (id) => api.post(`/solutions/${id}/accept`),
  rate: (id, rating) => api.post(`/solutions/${id}/rate`, { rating }),
};

export const manualsApi = {
  getAll: (params) => api.get('/manuals', { params }),
  getOne: (id) => api.get(`/manuals/${id}`),
  upload: (formData) => api.post('/manuals', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }),
  update: (id, data) => api.put(`/manuals/${id}`, data),
  delete: (id) => api.delete(`/manuals/${id}`),
  search: (id, q) => api.get(`/manuals/${id}/search`, { params: { q } }),
};

export const equipmentApi = {
  getAll: (params) => api.get('/equipment', { params }),
  getOne: (id) => api.get(`/equipment/${id}`),
  getByQR: (code) => api.get(`/equipment/qr/${code}`),
  create: (data) => api.post('/equipment', data),
  update: (id, data) => api.put(`/equipment/${id}`, data),
  delete: (id) => api.delete(`/equipment/${id}`),
  regenerateQR: (id) => api.post(`/equipment/${id}/regenerate-qr`),
  getLocations: () => api.get('/equipment/meta/locations'),
  importPreview: (formData) => api.post('/equipment/import/preview', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }),
  importExecute: (data) => api.post('/equipment/import/execute', data),
  importCancel: (tempFile) => api.post('/equipment/import/cancel', { tempFile }),
};

export const categoriesApi = {
  getAll: () => api.get('/categories'),
  create: (data) => api.post('/categories', data),
  update: (id, data) => api.put(`/categories/${id}`, data),
  delete: (id) => api.delete(`/categories/${id}`),
  getTags: () => api.get('/categories/tags/all'),
  createTag: (data) => api.post('/categories/tags', data),
};

export const usersApi = {
  getAll: (params) => api.get('/users', { params }),
  getOne: (id) => api.get(`/users/${id}`),
  create: (data) => api.post('/users', data),
  update: (id, data) => api.put(`/users/${id}`, data),
  delete: (id) => api.delete(`/users/${id}`),
  resetPassword: (id, password) => api.post(`/users/${id}/reset-password`, { password }),
};

export const searchApi = {
  global: (params) => api.get('/search', { params }),
  manualContent: (params) => api.get('/search/manuals/content', { params }),
  ai: (data) => api.post('/search/ai', data),
  suggestions: (q) => api.get('/search/suggestions', { params: { q } }),
};

export const dashboardApi = {
  getStats: () => api.get('/dashboard/stats'),
  getAnalytics: (period) => api.get('/dashboard/analytics', { params: { period } }),
  getAssignments: () => api.get('/dashboard/my-assignments'),
  getWatching: () => api.get('/dashboard/watching'),
  getNotifications: (params) => api.get('/dashboard/notifications', { params }),
  markNotificationRead: (id) => api.post(`/dashboard/notifications/${id}/read`),
  markAllRead: () => api.post('/dashboard/notifications/read-all'),
};

export const todosApi = {
  getAll: (params) => api.get('/todos', { params }),
  getOne: (id) => api.get(`/todos/${id}`),
  create: (data) => api.post('/todos', data),
  update: (id, data) => api.put(`/todos/${id}`, data),
  delete: (id) => api.delete(`/todos/${id}`),
  toggle: (id) => api.post(`/todos/${id}/toggle`),
  convertToIssue: (id) => api.post(`/todos/${id}/convert-to-issue`),
  reorder: (order) => api.post('/todos/reorder', { order }),
};

export const settingsApi = {
  getAI: () => api.get('/settings/ai'),
  updateAI: (api_key) => api.put('/settings/ai', { api_key }),
  testAI: (api_key) => api.post('/settings/ai/test', { api_key }),
};

export const rmasApi = {
  getAll: (params) => api.get('/rmas', { params }),
  getOne: (id) => api.get(`/rmas/${id}`),
  create: (data) => api.post('/rmas', data),
  update: (id, data) => api.put(`/rmas/${id}`, data),
  delete: (id) => api.delete(`/rmas/${id}`),
  updateStatus: (id, status) => api.post(`/rmas/${id}/status`, { status }),
  uploadImage: (id, formData) => api.post(`/rmas/${id}/images`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }),
  analyzeImage: (formData) => api.post('/rmas/analyze-image', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }),
  addNote: (id, content) => api.post(`/rmas/${id}/notes`, { content }),
  getStats: () => api.get('/rmas/stats/summary'),
};

export default api;
