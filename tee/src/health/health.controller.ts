import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiOkResponse } from '@nestjs/swagger';
import { HealthService } from './health.service';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @ApiOperation({ summary: 'TEE health check', description: 'Returns TEE runtime status including enclave identity, uptime, and last attestation timestamp.' })
  @ApiOkResponse({ description: 'TEE health status', schema: { type: 'object', properties: { status: { type: 'string', example: 'ok' }, enclaveId: { type: 'string' }, protocolVersion: { type: 'string' }, uptime: { type: 'number' }, lastAttestation: { type: 'string', nullable: true } } } })
  getHealth() {
    return this.healthService.getHealth();
  }
}
