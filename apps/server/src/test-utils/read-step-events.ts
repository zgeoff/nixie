interface StreamedRecord {
  readonly kind: string;
  readonly recordedAt: Date;
}

interface ReceivedEvent {
  readonly kind: string;

  readonly lagMs: number;
}

// a live stream's events, of which only the record events carry a record
interface StreamedEvent {
  readonly kind?: string;
  readonly record?: StreamedRecord;
}

type EventStream = AsyncIterator<StreamedEvent>;

type Events = readonly ReceivedEvent[];

const stepEnds: ReadonlySet<string> = new Set([
  'task.step_committed',
  'task.step_errored',
  'task.step_interrupted',
]);

export async function readStepEvents(stream: EventStream, now: () => number): Promise<Events> {
  const received: ReceivedEvent[] = [];

  for (;;) {
    const next = await stream.next();

    if (next.done === true) {
      return received;
    }

    const record = next.value.record;

    if (record !== undefined) {
      received.push({ kind: record.kind, lagMs: now() - record.recordedAt.getTime() });

      if (stepEnds.has(record.kind)) {
        return received;
      }
    }
  }
}
