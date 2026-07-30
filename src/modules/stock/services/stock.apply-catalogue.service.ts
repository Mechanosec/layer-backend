import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';

import { TransactionClient } from '../../../shared/database/types/database.type';
import {
  describeError,
  handleExceptionCode,
} from '../../../shared/utils/utils';
import { ProductVariantRepository } from '../repositories/product-variant.repository';
import { ProductRepository } from '../repositories/product.repository';
import { SeasonRepository } from '../repositories/season.repository';
import { ProductCatalogueCommand } from '../types/stock.type';

/**
 * Applies product master data from Business Central: the season, the product-level
 * attributes, and one row per variant.
 *
 * Deliberately touches no stock and triggers no recalculation — the catalogue
 * message carries no quantities, and a renamed product cannot change how much of
 * it there is. Variants that appear here with no stock yet simply have nothing to
 * publish.
 */
@Injectable()
export class StockApplyCatalogueService {
  constructor(
    private readonly logger: PinoLogger,
    private readonly seasonRepository: SeasonRepository,
    private readonly productRepository: ProductRepository,
    private readonly variantRepository: ProductVariantRepository,
  ) {}

  public async apply(
    command: ProductCatalogueCommand,
    tx: TransactionClient,
  ): Promise<{ variantCodes: string[] }> {
    try {
      const season = command.season
        ? await this.seasonRepository.ensureByName(command.season, tx)
        : undefined;

      await this.productRepository.upsertFromCatalogue(command, season?.id, tx);

      for (const descriptor of command.variants) {
        await this.variantRepository.upsertFromCatalogue(
          command.sku,
          descriptor,
          tx,
        );
      }

      this.logger.info(
        `[${StockApplyCatalogueService.name}]Catalogue for ${command.sku}: ${command.variants.length} variant(s)${season ? `, season ${season.name}` : ''}`,
      );

      return {
        variantCodes: command.variants.map((variant) => variant.variantCode),
      };
    } catch (error) {
      const errorMessage = `[${StockApplyCatalogueService.name}]Applying the catalogue for ${command.sku} was failed`;
      this.logger.error(errorMessage + ` with error: ${describeError(error)}`);
      throw handleExceptionCode(error as Error, errorMessage);
    }
  }
}
