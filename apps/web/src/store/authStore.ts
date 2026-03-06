import { create } from 'zustand';
import { authAPI } from '@/lib/api';

interface User {
  id: string;
  username: string;
  publicKey: string;
  pfpUrl?: string;
  primaryColor?: string;
  secondaryColor?: string;
  createdAt: string;
}

interface AuthState {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  notificationsMuted: boolean;
  setUser: (user: User | null) => void;
  setToken: (token: string | null) => void;
  login: (username: string, password: string, captchaToken?: string) => Promise<void>;
  register: (username: string, password: string, publicKey: string, captchaToken?: string) => Promise<void>;
  logout: () => void;
  checkAuth: () => Promise<void>;
  updatePFP: (pfpUrl: string) => void;
  updateUsername: (username: string) => Promise<User>;
  updateTheme: (primaryColor: string, secondaryColor: string) => Promise<void>;
  toggleNotifications: () => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  token: typeof window !== 'undefined' ? localStorage.getItem('token') : null,
  isLoading: false,
  isAuthenticated: false,
  notificationsMuted: typeof window !== 'undefined' ? localStorage.getItem('notificationsMuted') === 'true' : false,

  setUser: (user) => set({ user, isAuthenticated: !!user }),
  setToken: (token) => {
    if (token) {
      localStorage.setItem('token', token);
    } else {
      localStorage.removeItem('token');
    }
    set({ token });
  },

  login: async (username, password, captchaToken) => {
    set({ isLoading: true });
    try {
      const response = await authAPI.login({ username, password, captchaToken });
      const { user, token } = response.data;
      localStorage.setItem('token', token);
      localStorage.setItem('currentUserId', user.id);
      set({ user, token, isAuthenticated: true, isLoading: false });
    } catch (error) {
      set({ isLoading: false });
      throw error;
    }
  },

  register: async (username, password, publicKey, captchaToken) => {
    set({ isLoading: true });
    try {
      const response = await authAPI.register({ username, password, publicKey, captchaToken });
      const { user, token } = response.data;
      localStorage.setItem('token', token);
      localStorage.setItem('currentUserId', user.id);
      set({ user, token, isAuthenticated: true, isLoading: false });
    } catch (error) {
      set({ isLoading: false });
      throw error;
    }
  },

  logout: () => {
    localStorage.removeItem('token');
    localStorage.removeItem('privateKey');
    localStorage.removeItem('currentUserId');
    set({ user: null, token: null, isAuthenticated: false });
  },

  checkAuth: async () => {
    const token = localStorage.getItem('token');
    if (!token) {
      set({ isAuthenticated: false });
      return;
    }
    try {
      const response = await authAPI.me();
      localStorage.setItem('currentUserId', response.data.user.id);
      set({ user: response.data.user, isAuthenticated: true });
    } catch (error) {
      localStorage.removeItem('token');
      localStorage.removeItem('currentUserId');
      set({ user: null, token: null, isAuthenticated: false });
    }
  },

  updatePFP: (pfpUrl: string) => {
    const { user } = get();
    if (user) {
      set({ user: { ...user, pfpUrl } });
    }
  },

  updateUsername: async (username: string) => {
    const { token } = get();
    try {
      const response = await fetch('/api/auth/update-username', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ username })
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to update username');
      }
      
      const data = await response.json();
      localStorage.setItem('token', data.token);
      localStorage.setItem('currentUserId', data.user.id);
      set({ user: data.user, token: data.token });
      return data.user;
    } catch (error) {
      console.error('Update username error:', error);
      throw error;
    }
  },

  updateTheme: async (primaryColor: string, secondaryColor: string) => {
    const { token, user } = get();
    try {
      const response = await fetch('/api/auth/update-theme', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ primaryColor, secondaryColor })
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to update theme');
      }
      
      const data = await response.json();
      if (user) {
        set({ user: { ...user, primaryColor: data.user.primaryColor, secondaryColor: data.user.secondaryColor } });
      }
    } catch (error) {
      console.error('Update theme error:', error);
      throw error;
    }
  },

  toggleNotifications: () => {
    const { notificationsMuted } = get();
    const newValue = !notificationsMuted;
    localStorage.setItem('notificationsMuted', String(newValue));
    set({ notificationsMuted: newValue });
  },
}));
