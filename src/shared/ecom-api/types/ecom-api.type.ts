/** Which variant, in which region, we are asking e-com about. */
export interface ReservationQuery {
  sku: string;
  variantCode: string;
  /**
   * Region the calculation is for.
   *
   * OPEN QUESTION: it is not settled whether an e-com order reserves stock from a
   * specific BC region or across all of them. It is sent so a region-aware API
   * can use it; if e-com ignores it, the same reservation is subtracted from
   * every region the variant lives in.
   */
  regionCode: string;
}
