/**
 * کلاینت رسمی API نسخه ۲ — ارتباط هم‌مبدا از طریق پروکسی Vite/سرور
 * توکن دسترسی در حافظه و توکن بازیابی با عمر هفت روز نگهداری می‌شود.
 */
const ACCESS_KEY = 'fk_access_token';
const REFRESH_KEY = 'fk_refresh_token';

export class ApiError extends Error {
  code: string;
  status: number;
  details?: unknown;
  subscription?: unknown;
  constructor(status: number, code: string, message: string, details?: unknown, subscription?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
    this.subscription = subscription;
  }
}

let accessToken = sessionStorage.getItem(ACCESS_KEY) || '';
let refreshToken = localStorage.getItem(REFRESH_KEY) || '';
let refreshing: Promise<boolean> | null = null;

export function setTokens(access: string, refresh?: string) {
  accessToken = access;
  sessionStorage.setItem(ACCESS_KEY, access);
  if (refresh) {
    refreshToken = refresh;
    localStorage.setItem(REFRESH_KEY, refresh);
  }
}

export function clearTokens() {
  accessToken = '';
  refreshToken = '';
  sessionStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(REFRESH_KEY);
}

export function hasSession() {
  return !!(accessToken || refreshToken);
}

/**
 * بررسی در دسترس بودن سرور با مهلت کوتاه.
 * اگر سروری نباشد (استقرار صرفا استاتیک داخل htdocs) false برمی‌گرداند
 * تا برنامه وارد «حالت آفلاین محلی» شود.
 */
export async function pingServer(timeoutMs = 2500): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch('/api/v2/health', { signal: controller.signal });
    if (!res.ok) return false;
    const json = await res.json().catch(() => null);
    return !!(json && json.success === true);
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

const REQUEST_TIMEOUT_MS = 20_000;

async function rawRequest(method: string, path: string, body?: unknown, retry = true): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`/api/v2${path}`, {
      method,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (err) {
    if ((err as DOMException)?.name === 'AbortError') {
      throw new ApiError(504, 'REQUEST_TIMEOUT', 'زمان پاسخ سرور به پایان رسید؛ اتصال اینترنت یا سرور را بررسی کنید');
    }
    throw new ApiError(0, 'NETWORK_ERROR', 'ارتباط با سرور برقرار نشد؛ اگر سرور محلی را تازه روشن کرده‌اید چند لحظه دیگر تلاش کنید');
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 401 && retry && refreshToken && !path.startsWith('/auth/')) {
    const ok = await tryRefresh();
    if (ok) return rawRequest(method, path, body, false);
    clearTokens();
    if (!location.pathname.startsWith('/auth')) location.assign('/auth/login');
    throw new ApiError(401, 'SESSION_EXPIRED', 'نشست شما منقضی شده است');
  }

  const json = await res.json().catch(() => ({ success: false, error: { code: 'BAD_RESPONSE', message: 'پاسخ نامعتبر سرور' } }));
  if (!res.ok || json.success === false) {
    const err = json.error || {};
    throw new ApiError(res.status, err.code || 'ERROR', err.message || 'خطای ناشناخته', err.details, err.subscription);
  }
  return json.data;
}

async function tryRefresh(): Promise<boolean> {
  if (!refreshing) {
    refreshing = (async () => {
      try {
        const res = await fetch('/api/v2/auth/refresh', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken }),
        });
        if (!res.ok) return false;
        const json = await res.json();
        setTokens(json.data.accessToken, json.data.refreshToken);
        return true;
      } catch {
        return false;
      } finally {
        setTimeout(() => { refreshing = null; }, 0);
      }
    })();
  }
  return refreshing;
}

export const api = {
  get: (path: string) => rawRequest('GET', path),
  post: (path: string, body?: unknown) => rawRequest('POST', path, body),
  patch: (path: string, body?: unknown) => rawRequest('PATCH', path, body),
  put: (path: string, body?: unknown) => rawRequest('PUT', path, body),
  del: (path: string) => rawRequest('DELETE', path),
};
