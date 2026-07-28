import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsNotEmpty,
  IsNumberString,
  IsOptional,
  IsString,
} from 'class-validator';

/**
 * Full snapshot from Business Central: the absolute quantity of one variant in
 * one shop, together with the product attributes as BC knows them.
 */
export class BcGlobalStockEventDto {
  @ApiProperty({ example: '200202' })
  @IsString()
  @IsNotEmpty()
  sku!: string;

  @ApiProperty({ example: 'Кросівки жіночі' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiPropertyOptional({
    example: 'ЧОРНО-БІЛИЙ (вимк)/37',
    description: 'Colour/size descriptor',
  })
  @IsOptional()
  @IsString()
  metadata?: string;

  @ApiProperty({ example: '000' })
  @IsString()
  @IsNotEmpty()
  variantCode!: string;

  @ApiPropertyOptional({ example: 'ПАР' })
  @IsOptional()
  @IsString()
  unitMeasure?: string;

  @ApiProperty({ example: 10, description: 'Absolute stock in this shop' })
  @IsInt()
  quantity!: number;

  @ApiProperty({ example: '0119' })
  @IsString()
  @IsNotEmpty()
  shopCode!: string;

  @ApiPropertyOptional({ example: 'Кросівки' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({
    example: '283',
    description: 'BC sends the price as a string',
  })
  @IsOptional()
  @IsNumberString()
  price?: string;

  @ApiPropertyOptional({ example: 'NORBY' })
  @IsOptional()
  @IsString()
  brand?: string;

  @ApiPropertyOptional({ example: '6402999100' })
  @IsOptional()
  @IsString()
  customCategoryCode?: string;

  @ApiPropertyOptional({ example: 'менш як 24 см' })
  @IsOptional()
  @IsString()
  customCategoryCodeDescription?: string;
}
