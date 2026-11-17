import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type { DependencyStatus, HealthResponse } from '@leakguard/shared';
import { Queue } from 'bullmq';
import { DataSource } from 'typeorm';
import { QueueName } from '../../queue/queue.constants.js';

/** A dependency that does not answer within this time is reported as down. */
const CHECK_TIMEOUT_MS = 2_000;

@Injectable()
export class HealthService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectQueue(QueueName.ScanInitial) private readonly queue: Queue,
  ) {}

  async check(): Promise<HealthResponse> {
    const [database, redis] = await Promise.all([
      probe(() => this.dataSource.query('SELECT 1')),
      // A cheap read that needs a live Redis connection.
      probe(() => this.queue.isPaused()),
    ]);

    return {
      status: database === 'up' && redis === 'up' ? 'ok' : 'error',
      checks: { database, redis },
    };
  }
}

/** Runs a check with a timeout. Errors are not propagated: the details may contain connection strings. */
async function probe(check: () => Promise<unknown>): Promise<DependencyStatus> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('timeout')), CHECK_TIMEOUT_MS);
  });

  try {
    await Promise.race([check(), timeout]);
    return 'up';
  } catch {
    return 'down';
  } finally {
    clearTimeout(timer);
  }
}
