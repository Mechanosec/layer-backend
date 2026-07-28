import { Module } from '@nestjs/common';

import { isProduction } from '../../shared/config/app.config.constants';
import { StockModule } from '../stock/stock.module';
import { BcEventsController } from './bc-events.controller';
import { BcEventsSimulatorController } from './bc-events.simulator.controller';
import { BcEventsService } from './bc-events.service';
import { BcEventRepository } from './repositories/bc-event.repository';
import { BcEventsIngestService } from './services/bc-events.ingest.service';

@Module({
  imports: [StockModule],
  // The simulator writes stock, so it is kept out of production builds.
  controllers: isProduction
    ? [BcEventsController]
    : [BcEventsController, BcEventsSimulatorController],
  providers: [BcEventsService, BcEventsIngestService, BcEventRepository],
  exports: [BcEventsService],
})
export class BcEventsModule {}
