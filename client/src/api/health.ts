import type { HealthResponse } from '@leakguard/shared';
import { ApiError, apiGet } from './http';

/**
 * Fetches the API health. A 503 still carries the per-dependency report,
 * so it is returned as data instead of being treated as a failure.
 */
export async function fetchHealth(signal?: AbortSignal): Promise<HealthResponse> {
  try {
    return await apiGet<HealthResponse>('/health', signal);
  } catch (error) {
    if (error instanceof ApiError && error.status === 503 && isHealthResponse(error.body)) {
      return error.body;
    }
    throw error;
  }
}

function isHealthResponse(value: unknown): value is HealthResponse {
  return typeof value === 'object' && value !== null && 'status' in value && 'checks' in value;
}
