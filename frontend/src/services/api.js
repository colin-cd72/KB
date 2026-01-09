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
  updateAIConversation: (id, ai_conversation) => api.put(`/issues/${id}/ai-conversation`, { ai_conversation }),
  getAttachments: (id) => api.get(`/issues/${id}/attachments`),
  uploadImage: (id, formData) => api.post(`/issues/${id}/images`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }),
  analyzeImage: (id, image_path, context) => api.post(`/issues/${id}/analyze-image`, { image_path, context }),
  deleteAttachment: (id, attachmentId) => api.delete(`/issues/${id}/attachments/${attachmentId}`),
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
  // Manual management
  findManual: (id) => api.post(`/equipment/${id}/find-manual`),
  getManualSuggestions: (id) => api.get(`/equipment/${id}/manual-suggestions`),
  linkManual: (id, manual_id) => api.post(`/equipment/${id}/link-manual`, { manual_id }),
  unlinkManual: (id, manual_id) => api.post(`/equipment/${id}/unlink-manual`, { manual_id }),
  getWithoutManuals: () => api.get('/equipment/without-manuals/list'),
  // Image management
  fetchImage: (id) => api.post(`/equipment/${id}/fetch-image`, {}, { timeout: 120000 }),
  fetchImagesBulk: () => api.post('/equipment/fetch-images/bulk', {}, { timeout: 300000 }),
  getWithoutImages: () => api.get('/equipment/without-images/list'),
  uploadImage: (id, formData) => api.post(`/equipment/${id}/upload-image`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }),
  deleteImage: (id) => api.delete(`/equipment/${id}/image`),
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
  similarIssues: (data) => api.post('/search/similar-issues', data),
  continueConversation: (data) => api.post('/search/continue-conversation', data),
  // Quick search for command palette
  quick: (q) => api.get('/search/quick', { params: { q } }),
  // Search history
  getHistory: (limit) => api.get('/search/history', { params: { limit } }),
  clearHistory: () => api.delete('/search/history'),
  // Saved searches
  getSaved: () => api.get('/search/saved'),
  saveSearch: (data) => api.post('/search/saved', data),
  deleteSaved: (id) => api.delete(`/search/saved/${id}`),
};

export const dashboardApi = {
  getStats: () => api.get('/dashboard/stats'),
  getAnalytics: (period) => api.get('/dashboard/analytics', { params: { period } }),
  getAssignments: () => api.get('/dashboard/my-assignments'),
  getWatching: () => api.get('/dashboard/watching'),
  getNotifications: (params) => api.get('/dashboard/notifications', { params }),
  markNotificationRead: (id) => api.post(`/dashboard/notifications/${id}/read`),
  markAllRead: () => api.post('/dashboard/notifications/read-all'),
  // Widget endpoints
  getRmaAging: () => api.get('/dashboard/rma-aging'),
  getEquipmentFailures: () => api.get('/dashboard/equipment-failures'),
  getCommonIssues: () => api.get('/dashboard/common-issues'),
  getTrends: () => api.get('/dashboard/trends'),
};

export const todosApi = {
  getAll: (params) => api.get('/todos', { params }),
  getOne: (id) => api.get(`/todos/${id}`),
  create: (data) => api.post('/todos', data),
  quickAdd: (title) => api.post('/todos/quick', { title }),
  update: (id, data) => api.put(`/todos/${id}`, data),
  delete: (id) => api.delete(`/todos/${id}`),
  toggle: (id) => api.post(`/todos/${id}/toggle`),
  convertToIssue: (id) => api.post(`/todos/${id}/convert-to-issue`),
  reorder: (order) => api.post('/todos/reorder', { order }),
  uploadImages: (id, files) => {
    const formData = new FormData();
    files.forEach(file => formData.append('images', file));
    return api.post(`/todos/${id}/images`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
  },
  deleteImage: (imageId) => api.delete(`/todos/images/${imageId}`),
};

export const settingsApi = {
  getAI: () => api.get('/settings/ai'),
  updateAI: (api_key) => api.put('/settings/ai', { api_key }),
  testAI: (api_key) => api.post('/settings/ai/test', { api_key }),
  getNotifications: () => api.get('/settings/notifications'),
  updateNotifications: (data) => api.put('/settings/notifications', data),
  getTracking: () => api.get('/settings/tracking'),
  updateTracking: (api_key) => api.put('/settings/tracking', { api_key }),
  testTracking: (api_key) => api.post('/settings/tracking/test', { api_key }),
};

export const emailApi = {
  getSettings: () => api.get('/email/settings'),
  updateSettings: (data) => api.put('/email/settings', data),
  testEmail: (test_email) => api.post('/email/test', { test_email }),
  getPreferences: () => api.get('/email/preferences'),
  updatePreferences: (data) => api.put('/email/preferences', data),
  requestVerification: () => api.post('/email/verify/request'),
  verifyEmail: (token) => api.post(`/email/verify/${token}`),
  requestPasswordReset: (email) => api.post('/email/password-reset/request', { email }),
  resetPassword: (token, password) => api.post(`/email/password-reset/${token}`, { password }),
};

export const articlesApi = {
  getAll: (params) => api.get('/articles', { params }),
  getOne: (id) => api.get(`/articles/${id}`),
  getBySlug: (slug) => api.get(`/articles/by-slug/${slug}`),
  getFeatured: (limit) => api.get('/articles/featured', { params: { limit } }),
  create: (data) => api.post('/articles', data),
  update: (id, data) => api.put(`/articles/${id}`, data),
  delete: (id) => api.delete(`/articles/${id}`),
  publish: (id, is_published) => api.post(`/articles/${id}/publish`, { is_published }),
  feature: (id, is_featured) => api.post(`/articles/${id}/feature`, { is_featured }),
  uploadImage: (id, formData) => api.post(`/articles/${id}/images`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }),
  getImages: (id) => api.get(`/articles/${id}/images`),
  deleteImage: (imageId) => api.delete(`/articles/images/${imageId}`),
  search: (q, limit) => api.get('/articles/search/content', { params: { q, limit } }),
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
  linkImage: (id, image_path) => api.post(`/rmas/${id}/images/link`, { image_path }),
  analyzeImage: (formData) => api.post('/rmas/analyze-image', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }),
  addNote: (id, content) => api.post(`/rmas/${id}/notes`, { content }),
  getStats: () => api.get('/rmas/stats/summary'),
  lookupModel: (model_number, part_number) => api.post('/rmas/lookup-model', { model_number, part_number }),
  getContacts: (params) => api.get('/rmas/contacts', { params }),
  getReports: (params) => api.get('/rmas/reports', { params }),
  getTracking: (id) => api.get(`/rmas/${id}/tracking`),
  checkTracking: (id) => api.post(`/rmas/${id}/check-tracking`),
};

export default api;
