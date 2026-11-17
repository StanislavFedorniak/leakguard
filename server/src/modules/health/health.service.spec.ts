import type { Queue } from 'bullmq';
import type { DataSource } from 'typeorm';
import { describe, expect, it, vi } from 'vitest';
import { HealthService } from './health.service.js';

function createService(options: { dbFails?: boolean; redisFails?: boolean }): HealthService {
  const dataSource = {
    query: options.dbFails
      ? vi.fn().mockRejectedValue(new Error('connect ECONNREFUSED postgresql://u:secret@db'))
      : vi.fn().mockResolvedValue([{ '?column?': 1 }]),
  } as unknown as DataSource;

  const queue = {
    isPaused: options.redisFails
      ? vi.fn().mockRejectedValue(new Error('redis down'))
      : vi.fn().mockResolvedValue(false),
  } as unknown as Queue;

  return new HealthService(dataSource, queue);
}

describe('HealthService', () => {
  it('reports ok when all dependencies are up', async () => {
    await expect(createService({}).check()).resolves.toEqual({
      status: 'ok',
      checks: { database: 'up', redis: 'up' },
    });
  });

  it('reports the database as down without exposing the error', async () => {
    const result = await createService({ dbFails: true }).check();

    expect(result).toEqual({ status: 'error', checks: { database: 'down', redis: 'up' } });
    expect(JSON.stringify(result)).not.toContain('secret');
  });

  it('reports redis as down', async () => {
    await expect(createService({ redisFails: true }).check()).resolves.toEqual({
      status: 'error',
      checks: { database: 'up', redis: 'down' },
    });
  });
});
