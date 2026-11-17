import { Module } from '@nestjs/common';
import { QueueModule } from '../../queue/queue.module.js';
import { HealthController } from './health.controller.js';
import { HealthService } from './health.service.js';

@Module({
  imports: [QueueModule],
  controllers: [HealthController],
  providers: [HealthService],
})
export class HealthModule {}
