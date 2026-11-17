import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { REDIS_CONNECTION, RedisModule } from '../redis/redis.module.js';
import { QueueName } from './queue.constants.js';

/**
 * BullMQ setup and registration of the scan queues.
 * The API only adds jobs; the worker process registers the processors.
 */
@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [RedisModule],
      inject: [REDIS_CONNECTION],
      useFactory: (connection: Redis) => ({
        connection,
        defaultJobOptions: {
          attempts: 5,
          backoff: { type: 'exponential', delay: 5_000 },
          removeOnComplete: 1_000,
          removeOnFail: 5_000,
        },
      }),
    }),
    BullModule.registerQueue({ name: QueueName.ScanInitial }, { name: QueueName.ScanIncremental }),
  ],
  exports: [BullModule],
})
export class QueueModule {}
