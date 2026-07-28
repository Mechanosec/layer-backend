/** Mirrors the layer service's pipeline responses. */

export interface ShopRef {
  code: string;
  name: string | null;
  regionCode: string;
  regionName: string;
  safetyBuffer: number;
  includedInEcom: boolean;
}

export interface VariantRef {
  sku: string;
  variantCode: string;
  name: string;
  /** "КОРИЧНЕВИЙ · 42" */
  descriptor: string | null;
}

export interface Stand {
  shops: ShopRef[];
  variants: VariantRef[];
}

export interface ShopLine {
  shopCode: string;
  shopName: string | null;
  regionCode: string;
  quantity: number;
  includedInEcom: boolean;
  reportedAt: string;
}

export interface Calculation {
  regionCode: string;
  regionName: string;
  shopsTotal: number;
  safetyBuffer: number;
  reserved: number;
  quantity: number;
  publishedQuantity: number | null;
  reservationsStale: boolean;
  withheld: boolean;
  calculatedAt: string;
  publishedAt: string | null;
}

export type BcEventType = 'PRODUCT' | 'STOCK';
export type BcEventStatus = 'PENDING' | 'PROCESSED' | 'FAILED';

export interface PipelineEvent {
  type: BcEventType;
  status: BcEventStatus;
  topic: string;
  partition: number;
  offset: string;
  key: string | null;
  payload: Record<string, unknown>;
  receivedAt: string;
  processedAt: string | null;
  error: string | null;
}

export type OutboxStatus = 'PENDING' | 'SENT' | 'FAILED';

export interface OutboxRow {
  sku: string;
  variantCode: string;
  regionCode: string;
  quantity: number;
  status: OutboxStatus;
  attempts: number;
  lastError: string | null;
  createdAt: string;
  sentAt: string | null;
}

export interface BlockedTask {
  regionCode: string;
  status: 'PENDING' | 'ABANDONED';
  reason: string;
  attempts: number;
  lastError: string | null;
  lastTriedAt: string | null;
}

export interface Trace {
  sku: string;
  variantCode: string;
  name: string;
  descriptor: string | null;
  unitMeasure: string | null;
  seasonName: string | null;
  shops: ShopLine[];
  calculations: Calculation[];
  events: PipelineEvent[];
  outbox: OutboxRow[];
  blocked: BlockedTask[];
}

export interface Health {
  status: 'ok' | 'degraded';
  database: 'up' | 'down';
  reservations: {
    pendingRecalculations: number;
    abandonedRecalculations: number;
    staleQuantities: number;
  };
  uptimeSeconds: number;
}

/** Mock e-com control state. Not part of the real integration. */
export type EcomMode = 'ok' | 'down' | 'slow' | 'garbage';

export interface EcomState {
  reserved: number;
  mode: EcomMode;
}

/** Product master data — the "загальний" message. Carries no quantities. */
export interface ProductCommand {
  sku: string;
  name: string;
  unitMeasure?: string;
  brand?: string;
  price?: number;
  season?: { name: string; startingDate?: string; endingDate?: string };
  productHierarchy?: {
    division?: string;
    category?: string;
    retailProductCode?: string;
  };
  customCategoryCode?: string;
  customCategoryCodeDescription?: string;
  variants: {
    variantCode: string;
    barcodeNo?: string;
    color?: string;
    size?: string;
  }[];
}

/**
 * The stock message. BC has not settled on a shape, so the service accepts all of
 * them; the stand sends the single-warehouse form, which is the easiest to read.
 */
export interface StockCommand {
  sku: string;
  warehouseCode: string;
  variants: {
    variantCode: string;
    barcodeNo?: string;
    price?: number;
    quantity?: number;
    quantityDelta?: number;
  }[];
}
