import { create } from 'zustand';
import { api, setTokens, clearTokens, hasSession } from '@/lib/api/client';

export interface AuthUser {
  id: string;
  workspace_id: string;
  name: string;
  email: string;
  phone: string | null;
  role: 'owner' | 'admin' | 'accountant' | 'operator' | 'viewer';
  totp_enabled: number;
  suspended: number;
  must_change_password: number;
  created_at: string;
}

export interface Subscription {
  active: boolean;
  source: 'license' | 'trial' | 'expired';
  expiresAt: string | null;
  daysLeft: number;
  licenseExpiresAt: string | null;
  trialExpiresAt: string | null;
}

interface AuthState {
  user: AuthUser | null;
  subscription: Subscription | null;
  loading: boolean;
  authenticated: boolean;
  bootstrap: () => Promise<void>;
  login: (email: string, password: string) => Promise<{ twoFactorRequired?: boolean; challenge?: string }>;
  verify2fa: (challenge: string, code: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshSubscription: () => Promise<void>;
  setUser: (u: AuthUser) => void;
}

export const useAuth = create<AuthState>((set, get) => ({
  user: null,
  subscription: null,
  loading: true,
  authenticated: false,

  bootstrap: async () => {
    if (!hasSession()) {
      set({ loading: false, authenticated: false });
      return;
    }
    try {
      const data = await api.get('/auth/me') as { user: AuthUser; subscription: Subscription };
      set({ user: data.user, subscription: data.subscription, authenticated: true, loading: false });
    } catch {
      clearTokens();
      set({ user: null, authenticated: false, loading: false });
    }
  },

  login: async (email, password) => {
    const data = await api.post('/auth/login', { email, password }) as {
      twoFactorRequired?: boolean; challenge?: string;
      user?: AuthUser; accessToken?: string; refreshToken?: string;
    };
    if (data.twoFactorRequired) return { twoFactorRequired: true, challenge: data.challenge };
    setTokens(data.accessToken!, data.refreshToken);
    await get().bootstrap();
    return {};
  },

  verify2fa: async (challenge, code) => {
    const data = await api.post('/auth/2fa/verify', { challenge, code }) as {
      user: AuthUser; accessToken: string; refreshToken: string;
    };
    setTokens(data.accessToken, data.refreshToken);
    await get().bootstrap();
  },

  register: async (name, email, password) => {
    const data = await api.post('/auth/register', { name, email, password }) as {
      user: AuthUser; accessToken: string; refreshToken: string;
    };
    setTokens(data.accessToken, data.refreshToken);
    await get().bootstrap();
  },

  logout: async () => {
    try { await api.post('/auth/logout', {}); } catch { /* حتی اگر سرور در دسترس نبود محلی پاک شود */ }
    clearTokens();
    set({ user: null, subscription: null, authenticated: false });
  },

  refreshSubscription: async () => {
    const sub = await api.get('/subscription') as Subscription;
    set({ subscription: sub });
  },

  setUser: (u) => set({ user: u }),
}));

export const ROLE_LABELS: Record<AuthUser['role'], string> = {
  owner: 'مالک سازمان',
  admin: 'مدیر سامانه',
  accountant: 'حسابدار',
  operator: 'اپراتور اسکن',
  viewer: 'کاربر مشاهده‌گر',
};

const PERMISSIONS: Record<string, string[]> = {
  owner: ['*'],
  admin: ['invoice.read', 'invoice.write', 'invoice.delete', 'contact.read', 'contact.write',
    'product.read', 'product.write', 'report.read', 'export', 'sync', 'user.read', 'user.write',
    'ticket.read', 'ticket.reply', 'license.read', 'license.generate', 'audit.read'],
  accountant: ['invoice.read', 'invoice.write', 'invoice.delete', 'contact.read', 'contact.write',
    'product.read', 'product.write', 'report.read', 'export', 'sync', 'ticket.read', 'ticket.reply'],
  operator: ['invoice.read', 'invoice.write', 'contact.read', 'product.read', 'sync', 'ticket.read'],
  viewer: ['invoice.read', 'contact.read', 'product.read', 'report.read', 'ticket.read'],
};

export function can(role: AuthUser['role'] | undefined, permission: string): boolean {
  if (!role) return false;
  const perms = PERMISSIONS[role] || [];
  return perms.includes('*') || perms.includes(permission);
}
