// The assistant's standing ask for a take-over, as the client shows it. `reason` is null once the
// reason is forgotten.
export interface HandoverAsk {
  readonly sequence: number;
  readonly reason: string | null;
}

interface StreamedRecord {
  readonly kind: string;
  readonly sequence?: number | undefined;
  readonly forget?: { readonly sequence: number } | undefined;
  readonly handover?: { readonly reason?: string | undefined } | undefined;
}

// The ask after one more record of the live stream: an ask record opens it, a forget of its record
// drops its reason, and a take-over's start or the ask's close ends it.
export function pickHandoverAsk(
  current: HandoverAsk | null,
  record: StreamedRecord,
): HandoverAsk | null {
  if (record.kind === 'computer.handover_asked' && record.sequence !== undefined) {
    return { sequence: record.sequence, reason: record.handover?.reason ?? null };
  }

  if (record.kind === 'computer.handover_closed' || record.kind === 'computer.takeover_started') {
    return null;
  }

  if (current !== null && record.forget?.sequence === current.sequence) {
    return { sequence: current.sequence, reason: null };
  }

  return current;
}
