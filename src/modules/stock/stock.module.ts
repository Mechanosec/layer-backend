import { Module } from '@nestjs/common';

import { EcomModule } from '../ecom/ecom.module';
import { ProductVariantRepository } from './repositories/product-variant.repository';
import { ProductRepository } from './repositories/product.repository';
import { RegionRepository } from './repositories/region.repository';
import { ShopStockRepository } from './repositories/shop-stock.repository';
import { ShopRepository } from './repositories/shop.repository';
import { StockRecalculationTaskRepository } from './repositories/stock-recalculation-task.repository';
import { StockApplyDeltaService } from './services/stock.apply-delta.service';
import { StockApplySnapshotService } from './services/stock.apply-snapshot.service';
import { StockCalculateService } from './services/stock.calculate.service';
import { StockReadService } from './services/stock.read.service';
import { StockRecalculateService } from './services/stock.recalculate.service';
import { StockRetryRecalculationService } from './services/stock.retry-recalculation.service';
import { StockShopResolverService } from './services/stock.shop-resolver.service';
import { StockController } from './stock.controller';
import { StockService } from './stock.service';

@Module({
  imports: [EcomModule],
  controllers: [StockController],
  providers: [
    // Facade
    StockService,

    // Operations
    StockApplySnapshotService,
    StockApplyDeltaService,
    StockRecalculateService,
    StockRetryRecalculationService,
    StockCalculateService,
    StockReadService,
    StockShopResolverService,

    // Repositories
    ProductRepository,
    ProductVariantRepository,
    ShopRepository,
    ShopStockRepository,
    RegionRepository,
    StockRecalculationTaskRepository,
  ],
  exports: [StockService],
})
export class StockModule {}
