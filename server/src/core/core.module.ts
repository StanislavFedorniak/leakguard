import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validateEnv } from '../config/env.validation.js';
import { DatabaseModule } from '../database/database.module.js';
import { QueueModule } from '../queue/queue.module.js';

/**
 * Infrastructure shared by the API and the worker: configuration, database and queues.
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      // Local development keeps a single .env in the repository root.
      // In production the variables come from the environment, and missing files are ignored.
      envFilePath: ['.env', '../.env'],
      validate: validateEnv,
    }),
    DatabaseModule,
    QueueModule,
  ],
  exports: [DatabaseModule, QueueModule],
})
export class CoreModule {}
