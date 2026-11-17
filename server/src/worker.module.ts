import { Module } from '@nestjs/common';
import { CoreModule } from './core/core.module.js';

/** Root module of the background worker process. Queue processors are registered here. */
@Module({
  imports: [CoreModule],
})
export class WorkerModule {}
