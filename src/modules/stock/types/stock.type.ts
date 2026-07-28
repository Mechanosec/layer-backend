/**
 * Domain commands. Business Central DTOs are mapped onto these by the bc-events
 * module, so the stock module never depends on the shape of a Kafka message.
 */

/** Absolute stock of a variant in a shop, plus the product attributes BC knows. */
export interface StockSnapshotCommand {
  sku: string;
  name: string;
  variantCode: string;
  shopCode: string;
  quantity: number;
  metadata?: string;
  unitMeasure?: string;
  price?: string;
  category?: string;
  brand?: string;
  customCategoryCode?: string;
  customCategoryCodeDescription?: string;
}

/** Signed change to the stock of a variant in a shop. */
export interface StockDeltaCommand {
  sku: string;
  variantCode: string;
  shopCode: string;
  quantityDelta: number;
  unitMeasure?: string;
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
  BcSnapshot = 'bc-snapshot',
  BcDelta = 'bc-delta',
  ManualRequest = 'manual-request',
  /** A run started but e-com could not supply the reservations term. */
  EcomUnavailable = 'ecom-unavailable',
}

/** A shop resolved from a bare `shopCode`, with its region. */
export interface ResolvedShop {
  code: string;
  regionId: string;
  regionCode: string;
}
