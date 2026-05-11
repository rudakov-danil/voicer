import { create } from 'zustand';
import { persist } from 'zustand/middleware';
export const useAuthStore = create()(persist((set, get) => ({
    accessToken: null,
    refreshToken: null,
    user: null,
    setTokens: (accessToken, refreshToken) => set({ accessToken, refreshToken }),
    setUser: (user) => set({ user }),
    logout: () => set({ accessToken: null, refreshToken: null, user: null }),
    isAuthenticated: () => !!get().accessToken && !!get().user
}), {
    name: 'voiceiq-auth',
    partialize: (state) => ({ accessToken: state.accessToken, refreshToken: state.refreshToken, user: state.user })
}));
