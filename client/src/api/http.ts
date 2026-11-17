/** Base path of the REST API. In development Vite proxies it to the server. */
export const API_BASE = '/api/v1';

/** Error for a non-2xx response. The body is kept because some endpoints (health) return data with errors. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: unknown,
  ) {
    super(`API request failed with status ${status}`);
    this.name = 'ApiError';
  }
}

/**
 * The single HTTP client of the app. Sends cookies (the session lives in an httpOnly cookie)
 * and never stores tokens in the browser.
 */
export async function apiGet<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    headers: { Accept: 'application/json' },
    signal,
  });

  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiError(response.status, body);
  }
  // The server is the source of truth for the contract (types from @leakguard/shared);
  // runtime validation of every response would duplicate the server DTOs.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  return body as T;
}
