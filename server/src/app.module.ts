import { Module } from '@nestjs/common';
import { CoreModule } from './core/core.module.js';
import { HealthModule } from './modules/health/health.module.js';

/** Root module of the HTTP API process. */
@Module({
  imports: [CoreModule, HealthModule],
})
export class AppModule {}
