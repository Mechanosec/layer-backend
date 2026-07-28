import { Module } from '@nestjs/common';

import { EcomService } from './ecom.service';
import { EcomStockOutboxRepository } from './repositories/ecom-stock-outbox.repository';
import { EcomStockRepository } from './repositories/ecom-stock.repository';
import { EcomOutboxPublisherService } from './services/ecom.outbox-publisher.service';

@Module({
  providers: [
    EcomService,
    EcomOutboxPublisherService,
    EcomStockRepository,
    EcomStockOutboxRepository,
  ],
  exports: [EcomService],
})
export class EcomModule {}
