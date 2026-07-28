import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PipelineShopLineDto {
  @ApiProperty({ example: '0119' })
  shopCode!: string;

  @ApiPropertyOptional({ example: 'Київ, Хрещатик' })
  shopName?: string | null;

  @ApiProperty({ example: 'CENTRAL' })
  regionCode!: string;

  @ApiProperty({ example: 10 })
  quantity!: number;

  @ApiProperty({
    example: true,
    description: 'False for shops whose stock is not offered online',
  })
  includedInEcom!: boolean;

  @ApiProperty()
  reportedAt!: Date;
}

export class PipelineCalculationDto {
  @ApiProperty({ example: 'CENTRAL' })
  regionCode!: string;

  @ApiProperty({ example: 'Центральний' })
  regionName!: string;

  @ApiProperty({
    example: 15,
    description: 'Sum over the shops offered online',
  })
  shopsTotal!: number;

  @ApiProperty({ example: 2 })
  safetyBuffer!: number;

  @ApiProperty({
    example: 4,
    description: 'Units in orders with status "Новий"',
  })
  reserved!: number;

  @ApiProperty({ example: 9, description: 'Result of the calculation' })
  quantity!: number;

  @ApiPropertyOptional({
    example: 9,
    description:
      'What e-com actually holds; null if it was never told anything',
  })
  publishedQuantity?: number | null;

  @ApiProperty({
    example: false,
    description: 'True when the reservations term could not be confirmed',
  })
  reservationsStale!: boolean;

  @ApiProperty({
    example: false,
    description:
      'True when the calculated number was deliberately not sent, because it would raise availability on unconfirmed data',
  })
  withheld!: boolean;

  @ApiProperty()
  calculatedAt!: Date;

  @ApiPropertyOptional()
  publishedAt?: Date | null;
}

export class PipelineEventDto {
  @ApiProperty({ example: 'STOCK', enum: ['PRODUCT', 'STOCK'] })
  type!: string;

  @ApiProperty({
    example: 'PROCESSED',
    enum: ['PENDING', 'PROCESSED', 'FAILED'],
  })
  status!: string;

  @ApiProperty({ example: 'bc.stock.global' })
  topic!: string;

  @ApiProperty({ example: 0 })
  partition!: number;

  @ApiProperty({
    example: '17',
    description: 'Serialised as a string: it is a bigint',
  })
  offset!: string;

  @ApiPropertyOptional({ example: '200202:000' })
  key?: string | null;

  @ApiProperty({ description: 'The raw payload as Business Central sent it' })
  payload!: unknown;

  @ApiProperty()
  receivedAt!: Date;

  @ApiPropertyOptional()
  processedAt?: Date | null;

  @ApiPropertyOptional()
  error?: string | null;
}

export class PipelineOutboxDto {
  @ApiProperty({ example: '200202' })
  sku!: string;

  @ApiProperty({ example: '000' })
  variantCode!: string;

  @ApiProperty({ example: 'CENTRAL' })
  regionCode!: string;

  @ApiProperty({ example: 9 })
  quantity!: number;

  @ApiProperty({ example: 'SENT', enum: ['PENDING', 'SENT', 'FAILED'] })
  status!: string;

  @ApiProperty({ example: 0 })
  attempts!: number;

  @ApiPropertyOptional()
  lastError?: string | null;

  @ApiProperty()
  createdAt!: Date;

  @ApiPropertyOptional()
  sentAt?: Date | null;
}

export class PipelineBlockedDto {
  @ApiProperty({ example: 'CENTRAL' })
  regionCode!: string;

  @ApiProperty({ example: 'PENDING', enum: ['PENDING', 'ABANDONED'] })
  status!: string;

  @ApiProperty({ example: 'ecom-unavailable' })
  reason!: string;

  @ApiProperty({ example: 2 })
  attempts!: number;

  @ApiPropertyOptional()
  lastError?: string | null;

  @ApiPropertyOptional()
  lastTriedAt?: Date | null;
}

export class PipelineTraceDto {
  @ApiProperty({ example: '200202' })
  sku!: string;

  @ApiProperty({ example: '000' })
  variantCode!: string;

  @ApiProperty({ example: 'Кросівки жіночі' })
  name!: string;

  @ApiPropertyOptional({ example: 'КОРИЧНЕВИЙ · 42' })
  descriptor?: string | null;

  @ApiPropertyOptional({ example: 'ПАР' })
  unitMeasure?: string | null;

  @ApiPropertyOptional({ example: 'ВЕСНА 2025' })
  seasonName?: string | null;

  @ApiProperty({ type: [PipelineShopLineDto] })
  shops!: PipelineShopLineDto[];

  @ApiProperty({ type: [PipelineCalculationDto] })
  calculations!: PipelineCalculationDto[];

  @ApiProperty({ type: [PipelineEventDto] })
  events!: PipelineEventDto[];

  @ApiProperty({ type: [PipelineOutboxDto] })
  outbox!: PipelineOutboxDto[];

  @ApiProperty({ type: [PipelineBlockedDto] })
  blocked!: PipelineBlockedDto[];
}

export class PipelineVariantRefDto {
  @ApiProperty({ example: '200202' })
  sku!: string;

  @ApiProperty({ example: '000' })
  variantCode!: string;

  @ApiProperty({ example: 'Кросівки жіночі' })
  name!: string;

  @ApiPropertyOptional({ example: 'КОРИЧНЕВИЙ · 42' })
  descriptor?: string | null;
}

export class PipelineShopRefDto {
  @ApiProperty({ example: '0119' })
  code!: string;

  @ApiPropertyOptional({ example: 'Київ, Хрещатик' })
  name?: string | null;

  @ApiProperty({ example: 'CENTRAL' })
  regionCode!: string;

  @ApiProperty({ example: 'Центральний' })
  regionName!: string;

  @ApiProperty({ example: 2 })
  safetyBuffer!: number;

  @ApiProperty({ example: true })
  includedInEcom!: boolean;
}

export class PipelineStandDto {
  @ApiProperty({ type: [PipelineShopRefDto] })
  shops!: PipelineShopRefDto[];

  @ApiProperty({ type: [PipelineVariantRefDto] })
  variants!: PipelineVariantRefDto[];
}

export class PipelineActivityDto {
  @ApiProperty({ type: [PipelineEventDto] })
  events!: PipelineEventDto[];

  @ApiProperty({ type: [PipelineOutboxDto] })
  outbox!: PipelineOutboxDto[];
}
