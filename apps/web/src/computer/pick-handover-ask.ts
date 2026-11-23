// The assistant's standing ask for a take-over, as the client shows it. `reason` is null once the
// reason is forgotten.
export interface HandoverAsk {
  readonly reason: string | null;
}

interface StreamedRecord {
  readonly kind: string;
  readonly handover?: { readonly reason?: string | undefined } | undefined;
}

// The ask after one more record of the live stream: an ask record opens it, and a take-over's start
// or the ask's close ends it.
export function pickHandoverAsk(
  current: HandoverAsk | null,
  record: StreamedRecord,
): HandoverAsk | null {
  if (record.kind === 'computer.handover_asked') {
    return { reason: record.handover?.reason ?? null };
  }

  if (record.kind === 'computer.handover_closed' || record.kind === 'computer.takeover_started') {
    return null;
  }

  return current;
}
