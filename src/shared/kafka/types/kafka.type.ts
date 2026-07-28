/** Where a message sat in the log — the natural idempotency key. */
export interface KafkaMessageMeta {
  topic: string;
  partition: number;
  offset: string;
  key?: string;
}

export interface OutgoingMessage {
  key: string;
  value: unknown;
}
