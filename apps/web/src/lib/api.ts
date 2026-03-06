import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Global 401 handler
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('privateKey');
      localStorage.removeItem('currentUserId');
      localStorage.removeItem('horizon_notifications');
      window.location.href = '/';
    }
    return Promise.reject(error);
  }
);

export default api;

export const authAPI = {
  register: (data: { username: string; password: string; publicKey: string; captchaToken?: string }) =>
    api.post('/auth/register', data),
  login: (data: { username: string; password: string; captchaToken?: string }) =>
    api.post('/auth/login', data),
  me: () => api.get('/auth/me'),
};

export const roomAPI = {
  getRooms: () => api.get('/rooms'),
  createRoom: (data: { name: string; type: 'DM' | 'GROUP'; memberIds: string[] }) =>
    api.post('/rooms', data),
  createDM: (targetUserId: string) =>
    api.post('/rooms/dm', { targetUserId }),
  getMessages: (roomId: string, cursor?: string) =>
    api.get(`/rooms/${roomId}/messages`, { params: { cursor } }),
};

export const messageAPI = {
  send: (data: { roomId: string; content: string; encryptedKey: string; selfDestructMinutes?: number }) =>
    api.post('/messages', data),
  delete: (messageId: string) =>
    api.delete(`/messages/${messageId}`),
};

export const fileAPI = {
  upload: (file: File, encryptedKey: string, folder?: string, onProgress?: (progress: number) => void) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('encryptedKey', encryptedKey);
    if (folder) {
      formData.append('folder', folder);
    }
    return api.post('/files/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 0,
      onUploadProgress: onProgress ? (progressEvent) => {
        const progress = progressEvent.total 
          ? Math.round((progressEvent.loaded * 100) / progressEvent.total) 
          : 0;
        onProgress(progress);
      } : undefined,
    });
  },
  
  getInfo: (fileId: string) =>
    api.get(`/files/info/${fileId}`),
  
  download: (fileId: string, onProgress?: (progress: number) => void) =>
    api.get(`/files/download/${fileId}`, {
      responseType: 'blob',
      timeout: 0,
      onDownloadProgress: onProgress ? (progressEvent) => {
        const progress = progressEvent.total 
          ? Math.round((progressEvent.loaded * 100) / progressEvent.total) 
          : 0;
        onProgress(progress);
      } : undefined,
    }),
  
  delete: (fileId: string) =>
    api.delete(`/files/${fileId}`),
  
  uploadPFP: (file: File, onProgress?: (progress: number) => void) => {
    const formData = new FormData();
    formData.append('pfp', file);
    return api.post('/files/pfp', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 0,
      onUploadProgress: onProgress ? (progressEvent) => {
        const progress = progressEvent.total 
          ? Math.round((progressEvent.loaded * 100) / progressEvent.total) 
          : 0;
        onProgress(progress);
      } : undefined,
    });
  },
};
