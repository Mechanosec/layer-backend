/** Identifies the variant/region pair a calculated quantity belongs to. */
export interface EcomStockTarget {
  variantId: string;
  sku: string;
  variantCode: string;
  regionId: string;
  regionCode: string;
}

/** The calculated numbers, with the inputs kept so a published value can be explained. */
export interface EcomStockValue {
  quantity: number;
  shopsTotal: number;
  safetyBuffer: number;
  reserved: number;
}

/** The stored state of a variant/region pair. */
export interface EcomStockSnapshot {
  /** Last computed quantity, published or not. */
  quantity: number;
  reserved: number;
  reservationsStale: boolean;
  /** Last quantity handed to e-com; null when it has never been told anything. */
  publishedQuantity: number | null;
  publishedAt: Date | null;
}

/** Payload published on the e-com stock topic. */
export interface EcomStockMessage {
  sku: string;
  variantCode: string;
  regionCode: string;
  quantity: number;
  calculatedAt: string;
}
