interface StreamedRecord {
  readonly kind: string;
  readonly recordedAt: Date;
}

interface ReceivedEvent {
  readonly kind: string;

  // how long after nixie recorded the record the test received it
  readonly lagMs: number;
}

type EventStream = AsyncIterator<{ readonly record: StreamedRecord }>;

type Events = readonly ReceivedEvent[];

const stepEnds: ReadonlySet<string> = new Set([
  'task.step_committed',
  'task.step_errored',
  'task.step_interrupted',
]);

// Reads a live stream through the end of the next step, and notes when each record arrived. The
// stream stays open for the caller to end.
export async function collectStepEvents(stream: EventStream, now: () => number): Promise<Events> {
  const received: ReceivedEvent[] = [];

  for (;;) {
    const next = await stream.next();

    if (next.done === true) {
      return received;
    }

    received.push({
      kind: next.value.record.kind,
      lagMs: now() - next.value.record.recordedAt.getTime(),
    });

    if (stepEnds.has(next.value.record.kind)) {
      return received;
    }
  }
}
