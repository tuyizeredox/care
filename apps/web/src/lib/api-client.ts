'use client';

/**
 * Typed fetch wrapper for the OrgFlow API.
 *
 * Handles the response envelope, refreshes an expired access token once and
 * replays the original request, and turns every failure into an ApiError whose
 * message is safe to show the user (the API never returns raw errors).
 */
export interface ApiEnvelope<T> {
  success: true;
  data: T;
  meta?: Record<string, unknown>;
}

export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  [key: string]: unknown;
}

export interface Paginated<T> {
  data: T[];
  meta: PaginationMeta;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string = 'REQUEST_ERROR',
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api';
const ACCESS_TOKEN_KEY = 'orgflow.accessToken';
const REFRESH_TOKEN_KEY = 'orgflow.refreshToken';

export const tokenStore = {
  get access(): string | null {
    if (typeof window === 'undefined') return null;
    return window.localStorage.getItem(ACCESS_TOKEN_KEY);
  },
  get refresh(): string | null {
    if (typeof window === 'undefined') return null;
    return window.localStorage.getItem(REFRESH_TOKEN_KEY);
  },
  set(accessToken: string, refreshToken: string): void {
    window.localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
    window.localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
  },
  clear(): void {
    if (typeof window === 'undefined') return;
    window.localStorage.removeItem(ACCESS_TOKEN_KEY);
    window.localStorage.removeItem(REFRESH_TOKEN_KEY);
  },
};

export interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  query?: Record<string, unknown>;
  /** Skip the Authorization header (used by login and refresh). */
  anonymous?: boolean;
  /** Return the raw Response - used for file downloads. */
  raw?: boolean;
}

const buildUrl = (path: string, query?: Record<string, unknown>): string => {
  const url = new URL(API_URL.replace(/\/$/, '') + '/' + path.replace(/^\//, ''));
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) {
      if (value.length === 0) continue;
      url.searchParams.set(key, value.join(','));
    } else {
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
};

let refreshInFlight: Promise<boolean> | null = null;

/** Refreshes the token pair. Concurrent callers share one in-flight request. */
async function refreshTokens(): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    const refreshToken = tokenStore.refresh;
    if (!refreshToken) return false;
    try {
      const response = await fetch(buildUrl('auth/refresh'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      if (!response.ok) return false;
      const payload = (await response.json()) as ApiEnvelope<{
        accessToken: string;
        refreshToken: string;
      }>;
      tokenStore.set(payload.data.accessToken, payload.data.refreshToken);
      return true;
    } catch {
      return false;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}

async function toApiError(response: Response): Promise<ApiError> {
  let message = 'Something went wrong. Please try again.';
  let code = 'REQUEST_ERROR';
  let details: unknown;
  try {
    const payload = (await response.json()) as {
      error?: { message?: string; code?: string; details?: unknown };
    };
    if (payload?.error?.message) message = payload.error.message;
    if (payload?.error?.code) code = payload.error.code;
    details = payload?.error?.details;
  } catch {
    // Non-JSON error body (gateway timeout, proxy page) - keep the default.
  }
  return new ApiError(message, response.status, code, details);
}

/** Clears the session and bounces to the sign-in page. */
function endSession(): never {
  tokenStore.clear();
  if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
    window.location.href = '/login?expired=1';
  }
  throw new ApiError('Your session has expired. Please sign in again.', 401, 'UNAUTHORIZED');
}

export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { body, query, anonymous, raw, headers, ...init } = options;

  const send = async (): Promise<Response> => {
    const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;
    const requestHeaders = new Headers(headers);
    if (!isFormData && body !== undefined) {
      requestHeaders.set('Content-Type', 'application/json');
    }
    if (!anonymous && tokenStore.access) {
      requestHeaders.set('Authorization', 'Bearer ' + tokenStore.access);
    }
    return fetch(buildUrl(path, query), {
      ...init,
      headers: requestHeaders,
      body: isFormData ? (body as FormData) : body === undefined ? undefined : JSON.stringify(body),
    });
  };

  let response = await send();

  if (response.status === 401 && !anonymous) {
    if (await refreshTokens()) {
      response = await send();
    } else {
      endSession();
    }
  }

  if (!response.ok) throw await toApiError(response);
  if (raw) return response as unknown as T;
  if (response.status === 204) return undefined as T;

  const payload = (await response.json()) as ApiEnvelope<T>;
  return payload.data;
}

/** Same as apiFetch but keeps the pagination meta the list views need. */
export async function apiFetchPaginated<T>(
  path: string,
  options: RequestOptions = {},
): Promise<Paginated<T>> {
  // Strip the fields fetch() does not understand before spreading the rest.
  const { query, headers, body: _body, anonymous: _anonymous, raw: _raw, ...init } = options;

  const send = async (): Promise<Response> => {
    const requestHeaders = new Headers(headers);
    if (tokenStore.access) requestHeaders.set('Authorization', 'Bearer ' + tokenStore.access);
    return fetch(buildUrl(path, query), { ...init, headers: requestHeaders });
  };

  let response = await send();
  if (response.status === 401) {
    if (await refreshTokens()) {
      response = await send();
    } else {
      endSession();
    }
  }
  if (!response.ok) throw await toApiError(response);

  const payload = (await response.json()) as ApiEnvelope<T[]>;
  const fallbackMeta: PaginationMeta = {
    page: 1,
    pageSize: payload.data.length,
    total: payload.data.length,
    totalPages: 1,
    hasNextPage: false,
    hasPreviousPage: false,
  };
  return {
    data: payload.data,
    meta: (payload.meta as PaginationMeta | undefined) ?? fallbackMeta,
  };
}

/** Streams a report or attachment to the browser as a download. */
export async function downloadFile(
  path: string,
  query?: Record<string, unknown>,
): Promise<void> {
  const response = await apiFetch<Response>(path, { query, raw: true });
  const blob = await response.blob();
  const disposition = response.headers.get('Content-Disposition') ?? '';
  const match = disposition.match(/filename="?([^"]+)"?/);
  const fileName = match ? decodeURIComponent(match[1]) : 'orgflow-download';

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export const api = {
  get: <T>(path: string, options?: RequestOptions) =>
    apiFetch<T>(path, { ...options, method: 'GET' }),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    apiFetch<T>(path, { ...options, method: 'POST', body }),
  patch: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    apiFetch<T>(path, { ...options, method: 'PATCH', body }),
  put: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    apiFetch<T>(path, { ...options, method: 'PUT', body }),
  delete: <T>(path: string, options?: RequestOptions) =>
    apiFetch<T>(path, { ...options, method: 'DELETE' }),
  list: apiFetchPaginated,
  download: downloadFile,
};
