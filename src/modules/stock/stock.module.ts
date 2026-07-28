import { Module } from '@nestjs/common';

import { EcomModule } from '../ecom/ecom.module';
import { ProductVariantRepository } from './repositories/product-variant.repository';
import { ProductRepository } from './repositories/product.repository';
import { RegionRepository } from './repositories/region.repository';
import { SeasonRepository } from './repositories/season.repository';
import { ShopStockRepository } from './repositories/shop-stock.repository';
import { ShopRepository } from './repositories/shop.repository';
import { StockRecalculationTaskRepository } from './repositories/stock-recalculation-task.repository';
import { StockApplyCatalogueService } from './services/stock.apply-catalogue.service';
import { StockApplyStockService } from './services/stock.apply-stock.service';
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
    StockApplyCatalogueService,
    StockApplyStockService,
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
    SeasonRepository,
    StockRecalculationTaskRepository,
  ],
  exports: [StockService],
})
export class StockModule {}
