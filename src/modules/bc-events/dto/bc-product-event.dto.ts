import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsDateString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class BcSeasonDto {
  @ApiProperty({ example: 'ВЕСНА 2025' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiPropertyOptional({ example: '2025-03-01' })
  @IsOptional()
  @IsDateString()
  startingDate?: string;

  @ApiPropertyOptional({ example: '2025-05-31' })
  @IsOptional()
  @IsDateString()
  endingDate?: string;
}

export class BcProductHierarchyDto {
  @ApiPropertyOptional({ example: 'ОДЯГ' })
  @IsOptional()
  @IsString()
  division?: string;

  @ApiPropertyOptional({ example: 'Кросівки' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ example: 'КРОСІВКИ ЖІНОЧІ' })
  @IsOptional()
  @IsString()
  retailProductCode?: string;
}

export class BcProductVariantDto {
  @ApiProperty({ example: '000' })
  @IsString()
  @IsNotEmpty()
  variantCode!: string;

  @ApiPropertyOptional({ example: '770662476000' })
  @IsOptional()
  @IsString()
  barcodeNo?: string;

  @ApiPropertyOptional({ example: 'КОРИЧНЕВИЙ' })
  @IsOptional()
  @IsString()
  color?: string;

  @ApiPropertyOptional({
    example: '42',
    description: 'BC sends it as a string',
  })
  @IsOptional()
  @IsString()
  size?: string;
}

/**
 * The "загальний" message: everything Business Central knows about a product and
 * its variants. Carries **no stock** — quantities arrive on the stock message.
 *
 * Attributes that describe the product rather than one size (`unitMeasure`,
 * `price`, the customs codes) sit at the top level, which is why they are stored
 * on `Product` and not on `ProductVariant`.
 */
export class BcProductEventDto {
  @ApiProperty({ example: '200202' })
  @IsString()
  @IsNotEmpty()
  sku!: string;

  @ApiProperty({ example: 'Кросівки жіночі' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiPropertyOptional({ example: 'ПАР' })
  @IsOptional()
  @IsString()
  unitMeasure?: string;

  @ApiPropertyOptional({ example: 'NORBY' })
  @IsOptional()
  @IsString()
  brand?: string;

  @ApiPropertyOptional({ type: BcSeasonDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => BcSeasonDto)
  season?: BcSeasonDto;

  @ApiPropertyOptional({ type: BcProductHierarchyDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => BcProductHierarchyDto)
  productHierarchy?: BcProductHierarchyDto;

  @ApiPropertyOptional({ example: 699, description: 'A number, not a string' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  price?: number;

  @ApiPropertyOptional({ example: '6402999100' })
  @IsOptional()
  @IsString()
  customCategoryCode?: string;

  @ApiPropertyOptional({ example: 'менш як 24 см' })
  @IsOptional()
  @IsString()
  customCategoryCodeDescription?: string;

  @ApiProperty({ type: [BcProductVariantDto] })
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => BcProductVariantDto)
  variants!: BcProductVariantDto[];
}
