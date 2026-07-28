import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ESwaggerApiTag } from '../../shared/swagger/swagger.util';
import { HealthService } from './health.service';
import { HealthResponseDto } from './response/health.response.dto';

@ApiTags(ESwaggerApiTag.Health)
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @ApiOperation({ summary: 'Liveness and database connectivity' })
  @ApiOkResponse({ type: HealthResponseDto })
  public async check(): Promise<HealthResponseDto> {
    return this.healthService.check();
  }
}
