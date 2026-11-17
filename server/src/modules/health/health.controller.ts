import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import type { HealthResponse } from '@leakguard/shared';
import type { Response } from 'express';
import { HealthService } from './health.service.js';

@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  /** Liveness and readiness probe. Returns 503 when a dependency is unavailable. */
  @Get()
  async check(@Res({ passthrough: true }) res: Response): Promise<HealthResponse> {
    const result = await this.healthService.check();
    if (result.status !== 'ok') {
      res.status(HttpStatus.SERVICE_UNAVAILABLE);
    }
    return result;
  }
}
