/**
 * Numeric domain codes carried on error responses, so a caller can branch on the
 * cause without parsing messages.
 *
 * Ranges are per domain and never reused: 20xx stock, 21xx Business Central
 * ingest, 23xx the pipeline view. Add to the end of a group rather than
 * renumbering, and only add a code that something actually raises.
 */
export enum HttpCodeStockException {
  STOCK_PRODUCT_NOT_FOUND = 2001,
}

export enum HttpCodeBcEventException {
  /** A line carries both an absolute quantity and a delta. */
  BC_STOCK_LINE_AMBIGUOUS = 2101,
  /** A line carries neither — applying it would zero a real warehouse. */
  BC_STOCK_LINE_WITHOUT_QUANTITY = 2102,
  /** No warehouses on the variant and no warehouseCode on the message. */
  BC_STOCK_LINE_WITHOUT_WAREHOUSE = 2103,
  /** A variant mixes the nested and single-warehouse shapes. */
  BC_STOCK_LINE_MIXED_SHAPES = 2104,
}

export enum HttpCodePipelineException {
  PIPELINE_VARIANT_NOT_FOUND = 2301,
}
