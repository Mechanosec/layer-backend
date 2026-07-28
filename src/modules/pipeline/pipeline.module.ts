import { Module } from '@nestjs/common';

import { PipelineController } from './pipeline.controller';
import { PipelineService } from './pipeline.service';
import { PipelineRepository } from './repositories/pipeline.repository';

@Module({
  controllers: [PipelineController],
  providers: [PipelineService, PipelineRepository],
})
export class PipelineModule {}
