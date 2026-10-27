import { create } from 'zustand';
import { getSettings, saveSettings, DEFAULT_SETTINGS } from './db';
import type { AppSettings } from './types';

interface AppState {
  settings: AppSettings;
  loaded: boolean;
  sidebarCollapsed: boolean;
  load: () => Promise<void>;
  update: (patch: Partial<AppSettings>) => Promise<void>;
  toggleSidebar: () => void;
  applyTheme: (theme: 'dark' | 'light') => void;
}

function applyThemeClass(theme: 'dark' | 'light') {
  const root = document.documentElement;
  root.classList.toggle('dark', theme === 'dark');
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', theme === 'dark' ? '#0a0e1a' : '#6d5efc');
}

export const useAppStore = create<AppState>((set, get) => ({
  settings: { ...DEFAULT_SETTINGS },
  loaded: false,
  sidebarCollapsed: false,

  load: async () => {
    const s = await getSettings();
    applyThemeClass(s.theme);
    set({ settings: s, loaded: true });
  },

  update: async (patch) => {
    const next = await saveSettings(patch);
    if (patch.theme) applyThemeClass(patch.theme);
    set({ settings: next });
  },

  toggleSidebar: () => set((st) => ({ sidebarCollapsed: !st.sidebarCollapsed })),
  applyTheme: (theme) => {
    applyThemeClass(theme);
    void get().update({ theme });
  },
}));
