interface StreamedRecord {
  readonly kind: string;
  readonly recordedAt: Date;
}

export interface ReceivedEvent {
  readonly kind: string;

  // how long after nixie recorded the record this machine received it
  readonly lagMs: number;
}

const stepEnds: ReadonlySet<string> = new Set([
  'task.step_committed',
  'task.step_errored',
  'task.step_interrupted',
]);

// Reads a live stream through the end of the next step, and notes when each record arrived. The
// stream stays open for the caller to end.
export async function collectStepEvents(
  stream: AsyncIterator<{ readonly record: StreamedRecord }>,
  now: () => number,
): Promise<readonly ReceivedEvent[]> {
  const received: ReceivedEvent[] = [];

  for (;;) {
    // oxlint-disable-next-line no-await-in-loop -- each event follows the last
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
