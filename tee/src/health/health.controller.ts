import { Controller, Get } from '@nestjs/common';
import { HealthService } from './health.service';

/**
 * Health Controller
 *
 * Exposes GET /api/health returning real TEE runtime status.
 */
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  getHealth() {
    return this.healthService.getHealth();
  }
}
