// Reads the next count events of a live stream and returns them, leaving the stream open, so a
// test reads a stream to a known point and never loops on its own.
export async function readEvents<T>(
  stream: Readonly<{ next: () => Promise<IteratorResult<T, unknown>> }>,
  count: number,
): Promise<readonly T[]> {
  const events: T[] = [];

  while (events.length < count) {
    const next = await stream.next();

    if (next.done === true) {
      throw new Error(`the stream ended after ${events.length} of ${count} events`);
    }

    events.push(next.value);
  }

  return events;
}
