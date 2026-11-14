export interface WriterCounter {
  readonly writer: string;
  readonly counter: number;

  // how many counters the entry covers: a miss for a gap covers its whole run
  readonly span: number;
}

interface CaptureGap {
  readonly writer: string;
  readonly counter: number;
  readonly count: number;
}

interface CaptureGaps {
  readonly gaps: readonly CaptureGap[];

  // the sum over writers of the highest counter, which is how many requests the gateway sent
  readonly reachedTotal: number;
}

// A writer's counters run from 1 with no gap. A counter that `reached` names and `covered` leaves
// out, such as a `.part` file that never finished, is a request nixie does not hold.
export function collectCaptureGaps(
  covered: readonly WriterCounter[],
  reached: readonly WriterCounter[],
): CaptureGaps {
  const writers = new Set([...covered, ...reached].map((entry) => entry.writer));

  const gaps = [...writers].toSorted().flatMap((writer) => {
    const held = new Set(
      covered
        .filter((entry) => entry.writer === writer)
        .flatMap((entry) =>
          Array.from({ length: entry.span }, (_, index) => entry.counter + index),
        ),
    );

    return collectWriterGaps(writer, held, getHighest(writer, covered, reached));
  });

  const reachedTotal = [...writers].reduce(
    (total, writer) => total + getHighest(writer, covered, reached),
    0,
  );

  return { gaps, reachedTotal };
}

function collectWriterGaps(
  writer: string,
  held: ReadonlySet<number>,
  highest: number,
): readonly CaptureGap[] {
  const gaps: CaptureGap[] = [];
  let start: number | null = null;

  for (let counter = 1; counter <= highest + 1; counter += 1) {
    const isGap = counter <= highest && !held.has(counter);

    if (isGap && start === null) {
      start = counter;
    }

    if (!isGap && start !== null) {
      gaps.push({ writer, counter: start, count: counter - start });

      start = null;
    }
  }

  return gaps;
}

function getHighest(
  writer: string,
  covered: readonly WriterCounter[],
  reached: readonly WriterCounter[],
): number {
  return Math.max(
    0,
    ...[...covered, ...reached]
      .filter((entry) => entry.writer === writer)
      .map((entry) => entry.counter + entry.span - 1),
  );
}
