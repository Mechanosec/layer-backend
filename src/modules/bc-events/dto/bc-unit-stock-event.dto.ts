import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsOptional, IsString } from 'class-validator';

/**
 * Incremental change from Business Central: how far the stock of one variant
 * moved in one shop. Negative values are sales or write-offs.
 */
export class BcUnitStockEventDto {
  @ApiProperty({ example: '200202' })
  @IsString()
  @IsNotEmpty()
  sku!: string;

  @ApiProperty({ example: '000' })
  @IsString()
  @IsNotEmpty()
  variantCode!: string;

  @ApiPropertyOptional({ example: 'ПАР' })
  @IsOptional()
  @IsString()
  unitMeasure?: string;

  @ApiProperty({
    example: 10,
    description: 'Signed change to apply to the current shop stock',
  })
  @IsInt()
  quantityDelta!: number;

  @ApiProperty({ example: '0119' })
  @IsString()
  @IsNotEmpty()
  shopCode!: string;
}
