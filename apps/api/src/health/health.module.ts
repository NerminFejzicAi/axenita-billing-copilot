import { Module } from '@nestjs/common';

import { ReadinessService } from './application/readiness.service.js';
import { HealthController } from './controllers/health.controller.js';

/** Health module (01 §6). Contains no business logic and no tenant access. */
@Module({
  controllers: [HealthController],
  providers: [ReadinessService],
})
export class HealthModule {}
