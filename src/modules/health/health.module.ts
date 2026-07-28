import { Module } from '@nestjs/common';

import { EcomModule } from '../ecom/ecom.module';
import { StockModule } from '../stock/stock.module';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';

@Module({
  imports: [StockModule, EcomModule],
  controllers: [HealthController],
  providers: [HealthService],
})
export class HealthModule {}
