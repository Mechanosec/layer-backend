/**
 * Domain commands. Business Central DTOs are mapped onto these by the bc-events
 * module, so the stock module never depends on the shape of a Kafka message — and
 * does not care that BC is still changing its mind about that shape.
 */

/** One variant as the catalogue message describes it. */
export interface ProductVariantDescriptor {
  variantCode: string;
  barcodeNo?: string;
  color?: string;
  size?: string;
}

/**
 * Product master data: everything BC knows about a SKU and its variants, with no
 * stock in it at all.
 */
export interface ProductCatalogueCommand {
  sku: string;
  name: string;
  brand?: string;
  unitMeasure?: string;
  price?: number;
  division?: string;
  category?: string;
  retailProductCode?: string;
  customCategoryCode?: string;
  customCategoryCodeDescription?: string;
  season?: {
    name: string;
    startsAt?: Date;
    endsAt?: Date;
  };
  variants: ProductVariantDescriptor[];
}

/**
 * One variant in one shop. Exactly one of `quantity` and `quantityDelta` is set —
 * whichever BC turns out to send.
 */
export interface StockLine {
  variantCode: string;
  shopCode: string;
  /** Absolute stock, replacing whatever was stored. */
  quantity?: number;
  /** Signed change against the stored value. */
  quantityDelta?: number;
  barcodeNo?: string;
  /** Reported by the stock message; stored for reference only. */
  price?: number;
}

/** A stock message, flattened: one entry per variant/shop pair it touched. */
export interface StockUpdateCommand {
  sku: string;
  lines: StockLine[];
}

/** The variant a command referred to, and the region its shop belongs to. */
export interface StockTarget {
  variantId: string;
  sku: string;
  variantCode: string;
  regionId: string;
  regionCode: string;
}

/** Everything the formula is allowed to look at. */
export interface StockCalculationInput {
  /** Sum of stock across the ecom-enabled shops of the region. */
  shopsTotal: number;
  /** Units withheld from the channel for the region. */
  safetyBuffer: number;
  /** Units already claimed by orders in the "Новий" status. */
  reserved: number;
}

export interface StockCalculationResult extends StockCalculationInput {
  /** What e-com should show. Never negative. */
  quantity: number;
}

export interface StockRecalculationResult extends StockCalculationResult {
  regionCode: string;
  /** True when `reserved` was carried over because e-com could not be reached. */
  reservationsStale: boolean;
  /** Whether the number was queued for e-com. Stale results may be withheld. */
  published: boolean;
}

/** Why a variant/region pair needs recalculating. Stored on the retry task. */
export enum ERecalculationReason {
  BcStock = 'bc-stock',
  ManualRequest = 'manual-request',
  /** A run started but e-com could not supply the reservations term. */
  EcomUnavailable = 'ecom-unavailable',
}

/** A shop resolved from a bare `warehouseCode`, with its region. */
export interface ResolvedShop {
  code: string;
  regionId: string;
  regionCode: string;
}
