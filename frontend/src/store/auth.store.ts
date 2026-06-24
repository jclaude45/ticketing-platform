import { create } from 'zustand';
import type { User } from '@/types';
import { clearTokens, setStoredUser, getStoredUser } from '@/lib/auth';

// C2 FIX: auth state no longer persisted to localStorage with isAuthenticated flag.
// On page load: isAuthenticated=false until the AuthProvider does a silent /auth/refresh
// (the httpOnly refresh_token cookie is sent automatically — user stays logged in across refreshes
// without ever exposing tokens to localStorage/JS).
//
// Only the user profile (non-sensitive) is kept in localStorage for UX (show name in sidebar
// while the silent refresh completes). The isAuthenticated flag is always re-derived at runtime.

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  requires2FA: boolean;
  setUser: (user: User | null) => void;
  setAuthenticated: (val: boolean) => void;
  setLoading: (val: boolean) => void;
  setRequires2FA: (val: boolean) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()((set) => ({
  // Seed user from localStorage for immediate display (not trusted for auth decisions)
  user: typeof window !== 'undefined' ? getStoredUser() : null,
  isAuthenticated: false, // always false until AuthProvider confirms via /auth/refresh
  isLoading: true,
  requires2FA: false,

  setUser: (user) => {
    if (user) setStoredUser(user);
    else if (typeof window !== 'undefined') localStorage.removeItem('ticketing_user');
    set({ user });
  },
  setAuthenticated: (isAuthenticated) => set({ isAuthenticated }),
  setLoading: (isLoading) => set({ isLoading }),
  setRequires2FA: (requires2FA) => set({ requires2FA }),
  logout: () => {
    clearTokens();
    set({ user: null, isAuthenticated: false, requires2FA: false });
  },
}));
