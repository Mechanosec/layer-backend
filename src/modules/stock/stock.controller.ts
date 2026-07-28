import { Controller, Get, Param, Post } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';

import { ESwaggerApiTag } from '../../shared/swagger/swagger.util';
import {
  ProductStockResponseDto,
  RecalculationResponseDto,
} from './response/stock.response.dto';
import { StockService } from './stock.service';

@ApiTags(ESwaggerApiTag.Stock)
@Controller('stock')
export class StockController {
  constructor(private readonly stockService: StockService) {}

  @Get(':sku')
  @ApiOperation({
    summary: 'Stock of a SKU',
    description:
      'Per-shop quantities as reported by Business Central, plus the calculated quantity published to e-com for each region.',
  })
  @ApiParam({ name: 'sku', example: '200202' })
  @ApiOkResponse({ type: ProductStockResponseDto })
  public async getBySku(
    @Param('sku') sku: string,
  ): Promise<ProductStockResponseDto> {
    return this.stockService.getBySku(sku);
  }

  @Post(':sku/:variantCode/recalculate')
  @ApiOperation({
    summary: 'Recalculate a variant',
    description:
      "Re-runs the e-com stock calculation for every region the variant holds stock in and queues the results for e-com. Use it after changing a region's safety buffer or shop selection, where no BC event will arrive.",
  })
  @ApiParam({ name: 'sku', example: '200202' })
  @ApiParam({ name: 'variantCode', example: '000' })
  @ApiOkResponse({ type: [RecalculationResponseDto] })
  public async recalculate(
    @Param('sku') sku: string,
    @Param('variantCode') variantCode: string,
  ): Promise<RecalculationResponseDto[]> {
    const results = await this.stockService.recalculateVariant(
      sku,
      variantCode,
    );

    return results.map((result) => ({
      regionCode: result.regionCode,
      quantity: result.quantity,
      shopsTotal: result.shopsTotal,
      safetyBuffer: result.safetyBuffer,
      reserved: result.reserved,
      reservationsStale: result.reservationsStale,
      published: result.published,
    }));
  }
}
