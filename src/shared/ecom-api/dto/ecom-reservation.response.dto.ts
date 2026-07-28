import { IsInt, IsOptional, IsString, Min } from 'class-validator';

/**
 * Shape of the e-com reservations endpoint.
 *
 * ASSUMED CONTRACT — confirm against the real API. It is validated rather than
 * trusted so a changed response fails loudly instead of quietly turning into
 * `reserved = 0`, which would overstate stock and invite overselling.
 *
 * Deliberately **no** `@Type(() => Number)` and the caller does not use
 * `enableImplicitConversion`: coercion is what makes this dangerous. With it,
 * `{"reserved": ""}` and `{"reserved": false}` both become a clean `0` that
 * passes `@IsInt @Min(0)` and is then treated as a confirmed "nothing is
 * reserved". A string `"7"` is rejected too — if e-com starts sending numbers as
 * strings we want to hear about it, not guess.
 */
export class EcomReservationResponseDto {
  @IsOptional()
  @IsString()
  sku?: string;

  @IsOptional()
  @IsString()
  variantCode?: string;

  /** Units of this variant sitting in orders with status "Новий". */
  @IsInt()
  @Min(0)
  reserved!: number;
}
