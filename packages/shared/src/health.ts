/** State of a single infrastructure dependency. */
export type DependencyStatus = 'up' | 'down';

/** Response contract of `GET /api/v1/health`. */
export interface HealthResponse {
  status: 'ok' | 'error';
  checks: {
    database: DependencyStatus;
    redis: DependencyStatus;
  };
}
