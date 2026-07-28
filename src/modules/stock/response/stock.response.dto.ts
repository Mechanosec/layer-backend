import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ShopStockResponseDto {
  @ApiProperty({ example: '0119' })
  shopCode!: string;

  @ApiPropertyOptional({ example: 'Київ, Хрещатик' })
  shopName?: string | null;

  @ApiProperty({
    example: true,
    description: 'Whether this shop feeds the e-com calculation',
  })
  includedInEcom!: boolean;

  @ApiProperty({ example: 10 })
  quantity!: number;

  @ApiProperty({ description: 'When BC last reported this quantity' })
  reportedAt!: Date;
}

export class EcomStockResponseDto {
  @ApiProperty({ example: 'CENTRAL' })
  regionCode!: string;

  @ApiProperty({ example: 'Центральний' })
  regionName!: string;

  @ApiProperty({ example: 7, description: 'Quantity published to e-com' })
  quantity!: number;

  @ApiProperty({
    example: 10,
    description: 'Sum over the ecom-enabled shops of the region',
  })
  shopsTotal!: number;

  @ApiProperty({ example: 2 })
  safetyBuffer!: number;

  @ApiProperty({
    example: 1,
    description: 'Units held by orders in the "Новий" status',
  })
  reserved!: number;

  @ApiProperty({
    example: false,
    description:
      'True when `reserved` is a carried-over value because e-com could not be reached',
  })
  reservationsStale!: boolean;

  @ApiPropertyOptional({
    example: 9,
    description:
      'The number e-com actually holds. Differs from `quantity` when a result computed without fresh reservations was withheld.',
  })
  publishedQuantity?: number | null;

  @ApiProperty()
  calculatedAt!: Date;

  @ApiPropertyOptional({
    description: 'Null while the update is still queued in the outbox',
  })
  publishedAt?: Date | null;
}

export class VariantStockResponseDto {
  @ApiProperty({ example: '000' })
  variantCode!: string;

  @ApiPropertyOptional({ example: 'ЧОРНО-БІЛИЙ (вимк)/37' })
  metadata?: string | null;

  @ApiPropertyOptional({ example: 'ПАР' })
  unitMeasure?: string | null;

  @ApiPropertyOptional({
    example: '283',
    description: 'Decimal serialised as a string',
  })
  price?: string | null;

  @ApiProperty({ type: [ShopStockResponseDto] })
  shops!: ShopStockResponseDto[];

  @ApiProperty({ type: [EcomStockResponseDto] })
  ecom!: EcomStockResponseDto[];
}

export class ProductStockResponseDto {
  @ApiProperty({ example: '200202' })
  sku!: string;

  @ApiProperty({ example: 'Кросівки жіночі' })
  name!: string;

  @ApiPropertyOptional({ example: 'Кросівки' })
  category?: string | null;

  @ApiPropertyOptional({ example: 'NORBY' })
  brand?: string | null;

  @ApiProperty({ type: [VariantStockResponseDto] })
  variants!: VariantStockResponseDto[];
}

export class RecalculationResponseDto {
  @ApiProperty({ example: 'CENTRAL' })
  regionCode!: string;

  @ApiProperty({ example: 7 })
  quantity!: number;

  @ApiProperty({ example: 10 })
  shopsTotal!: number;

  @ApiProperty({ example: 2 })
  safetyBuffer!: number;

  @ApiProperty({ example: 1 })
  reserved!: number;

  @ApiProperty({
    example: false,
    description:
      'True when e-com could not be reached for the reservations term',
  })
  reservationsStale!: boolean;

  @ApiProperty({
    example: true,
    description:
      'Whether the number was queued for e-com. A stale result is withheld unless it lowers availability.',
  })
  published!: boolean;
}
