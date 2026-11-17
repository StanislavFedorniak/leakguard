import { Inject, Logger, Module, type OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import type { EnvironmentVariables } from '../config/env.validation.js';

/** Injection token of the shared ioredis connection. */
export const REDIS_CONNECTION = Symbol('REDIS_CONNECTION');

/**
 * Shared Redis connection. BullMQ 6 cannot `require` ioredis from native ESM,
 * so the client is constructed here and handed to BullMQ as an instance.
 */
@Module({
  providers: [
    {
      provide: REDIS_CONNECTION,
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvironmentVariables, true>) => {
        const redis = new Redis(config.get('REDIS_URL', { infer: true }), {
          // Required by BullMQ: blocking commands must wait for reconnection instead of failing.
          maxRetriesPerRequest: null,
          connectionName: 'leakguard',
        });
        // Without a listener ioredis prints unhandled error events. Only the error code
        // is logged: it never contains the connection URL with the password.
        redis.on('error', (error: NodeJS.ErrnoException) =>
          Logger.warn(`Connection error: ${error.code ?? error.name}`, 'Redis'),
        );
        return redis;
      },
    },
  ],
  exports: [REDIS_CONNECTION],
})
export class RedisModule implements OnApplicationShutdown {
  constructor(@Inject(REDIS_CONNECTION) private readonly redis: Redis) {}

  /** Nest shuts down dependents first, so the queues are already closed at this point. */
  async onApplicationShutdown(): Promise<void> {
    if (this.redis.status !== 'end') {
      await this.redis.quit();
    }
  }
}
