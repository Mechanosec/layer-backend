import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class BcStockWarehouseDto {
  @ApiProperty({ example: '0119' })
  @IsString()
  @IsNotEmpty()
  warehouseCode!: string;

  @ApiPropertyOptional({
    example: 10,
    description: 'Absolute stock in this warehouse',
  })
  @IsOptional()
  @IsInt()
  quantity?: number;

  @ApiPropertyOptional({
    example: -3,
    description: 'Signed change, if BC sends deltas',
  })
  @IsOptional()
  @IsInt()
  quantityDelta?: number;
}

export class BcStockVariantDto {
  @ApiProperty({ example: '000' })
  @IsString()
  @IsNotEmpty()
  variantCode!: string;

  @ApiPropertyOptional({ example: '770662476000' })
  @IsOptional()
  @IsString()
  barcodeNo?: string;

  /**
   * Present in the samples, and nobody has explained why a stock message carries a
   * price. Accepted so the message is not rejected, and stored for reference — no
   * stock logic reads it.
   */
  @ApiPropertyOptional({ example: 699 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  price?: number;

  /** Set when the message covers a single warehouse named at the top level. */
  @ApiPropertyOptional({ example: 10 })
  @IsOptional()
  @IsInt()
  quantity?: number;

  @ApiPropertyOptional({ example: -3 })
  @IsOptional()
  @IsInt()
  quantityDelta?: number;

  /** Set when one message covers several warehouses per variant. */
  @ApiPropertyOptional({ type: [BcStockWarehouseDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BcStockWarehouseDto)
  warehouses?: BcStockWarehouseDto[];
}

/**
 * The stock message. Business Central has not settled its shape, so all four
 * combinations under discussion are accepted and normalised into one command:
 *
 *   1. warehouses nested per variant, absolute  — variants[].warehouses[].quantity
 *   2. warehouses nested per variant, delta     — variants[].warehouses[].quantityDelta
 *   3. one warehouse per message, absolute      — warehouseCode + variants[].quantity
 *   4. one warehouse per message, delta         — warehouseCode + variants[].quantityDelta
 *
 * Absorbing the undecided part here keeps it out of the rest of the service: the
 * stock module only ever sees "set this quantity" or "adjust by this much".
 * Once BC decides, the branches that are not used can be deleted.
 */
export class BcStockEventDto {
  @ApiProperty({ example: '200202' })
  @IsString()
  @IsNotEmpty()
  sku!: string;

  /** Only in the single-warehouse shape; ignored when variants carry `warehouses`. */
  @ApiPropertyOptional({ example: '0119' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  warehouseCode?: string;

  @ApiProperty({ type: [BcStockVariantDto] })
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => BcStockVariantDto)
  variants!: BcStockVariantDto[];
}
