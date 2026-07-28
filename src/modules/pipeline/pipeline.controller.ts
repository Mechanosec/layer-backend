import { Controller, Get, Param } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';

import { ESwaggerApiTag } from '../../shared/swagger/swagger.util';
import { PipelineService } from './pipeline.service';
import {
  PipelineActivityDto,
  PipelineStandDto,
  PipelineTraceDto,
} from './response/pipeline.response.dto';

/**
 * Read-only view of the whole flow, for the visualiser that explains the stock
 * calculation to people who do not read logs.
 */
@ApiTags(ESwaggerApiTag.Pipeline)
@Controller('pipeline')
export class PipelineController {
  constructor(private readonly pipelineService: PipelineService) {}

  @Get('stand')
  @ApiOperation({
    summary: 'Shops and known variants',
    description:
      'Reference data for the visualiser, so it offers real shop codes and SKUs instead of inventing them.',
  })
  @ApiOkResponse({ type: PipelineStandDto })
  public async getStand(): Promise<PipelineStandDto> {
    return this.pipelineService.getStand();
  }

  @Get('activity')
  @ApiOperation({
    summary: 'Recent events and publications',
    description:
      'The latest Business Central messages and e-com publications, newest first.',
  })
  @ApiOkResponse({ type: PipelineActivityDto })
  public async getActivity(): Promise<PipelineActivityDto> {
    return this.pipelineService.getActivity();
  }

  @Get('trace/:sku/:variantCode')
  @ApiOperation({
    summary: 'Full journey of one variant',
    description:
      'What BC sent, the stock it produced per shop, the calculation for each region, and what e-com was told.',
  })
  @ApiParam({ name: 'sku', example: '200202' })
  @ApiParam({ name: 'variantCode', example: '000' })
  @ApiOkResponse({ type: PipelineTraceDto })
  public async getTrace(
    @Param('sku') sku: string,
    @Param('variantCode') variantCode: string,
  ): Promise<PipelineTraceDto> {
    return this.pipelineService.getTrace(sku, variantCode);
  }
}
