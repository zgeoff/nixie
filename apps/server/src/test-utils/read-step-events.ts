interface StreamedRecord {
  readonly kind: string;
  readonly recordedAt: Date;
}

interface ReceivedEvent {
  readonly kind: string;

  readonly lagMs: number;
}

type EventStream = AsyncIterator<{ readonly record: StreamedRecord }>;

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

    received.push({
      kind: next.value.record.kind,
      lagMs: now() - next.value.record.recordedAt.getTime(),
    });

    if (stepEnds.has(next.value.record.kind)) {
      return received;
    }
  }
}
