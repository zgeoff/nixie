interface ThreadRecord {
  readonly kind: string;
  readonly sequence: number;
  readonly payload: Readonly<Record<string, unknown>>;
}

// The replies that stand on the timeline: each model.reply that no model.reply_voided names.
export function collectUnvoidedReplies<T extends ThreadRecord>(records: readonly T[]): T[] {
  const voided = new Set(
    records
      .filter((record) => record.kind === 'model.reply_voided')
      .map((record) => record.payload['replySequence']),
  );

  return records.filter((record) => record.kind === 'model.reply' && !voided.has(record.sequence));
}
