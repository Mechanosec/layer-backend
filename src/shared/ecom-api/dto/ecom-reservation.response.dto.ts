import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';

/**
 * Shape of the e-com reservations endpoint.
 *
 * ASSUMED CONTRACT — confirm against the real API. It is validated rather than
 * trusted so a changed response fails loudly instead of quietly turning into
 * `reserved = 0`, which would overstate stock.
 */
export class EcomReservationResponseDto {
  @IsOptional()
  @IsString()
  sku?: string;

  @IsOptional()
  @IsString()
  variantCode?: string;

  /** Units of this variant sitting in orders with status "Новий". */
  @Type(() => Number)
  @IsInt()
  @Min(0)
  reserved!: number;
}
