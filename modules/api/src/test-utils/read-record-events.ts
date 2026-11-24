interface LiveEventLike {
  readonly kind: string;
}

interface EventStream<Event> {
  readonly next: () => Promise<IteratorResult<Event, unknown>>;
}

// Reads from a live stream until it has the given number of record events, and skips the opened
// and changed events between them.
export async function readRecordEvents<Event extends LiveEventLike>(
  stream: Readonly<EventStream<Event>>,
  count: number,
): Promise<readonly Extract<Event, { kind: 'record' }>[]> {
  const records: Extract<Event, { kind: 'record' }>[] = [];

  while (records.length < count) {
    const next = await stream.next();

    if (next.done === true) {
      throw new Error(`the stream ended after ${records.length} of ${count} record events`);
    }

    if (isRecordEvent(next.value)) {
      records.push(next.value);
    }
  }

  return records;
}

function isRecordEvent<Event extends LiveEventLike>(
  event: Event,
): event is Extract<Event, { kind: 'record' }> {
  return event.kind === 'record';
}
