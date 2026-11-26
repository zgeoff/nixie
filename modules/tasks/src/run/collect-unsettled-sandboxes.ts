import type { MeterRead } from '@heynixie/budgets';

export interface UnsettledSandbox {
  readonly sandbox: string;

  // the most that any read of the sandbox counted, in whole micros
  readonly lastMicros: number;

  // the runner's own tally under the task's ID, which no gateway holds
  readonly isTally: boolean;
}

// The sandboxes that a task run read and that have no read at the task run's end. When the end
// attempt names the sandboxes it settled itself, a read at the end that the attempt did not take
// counts for nothing.
export function collectUnsettledSandboxes(
  reads: readonly MeterRead[],
  taskID: string,
  settled?: ReadonlySet<string>,
): readonly UnsettledSandbox[] {
  const ended = new Set(
    reads
      .filter((read) => read.reason === 'run_end')
      .map((read) => read.sandbox)
      .filter((sandbox) => settled === undefined || settled.has(sandbox)),
  );

  const lasts = new Map<string, number>();

  for (const read of reads) {
    lasts.set(read.sandbox, Math.max(lasts.get(read.sandbox) ?? 0, read.countMicros));
  }

  return [...lasts]
    .filter(([sandbox]) => !ended.has(sandbox))
    .map(([sandbox, lastMicros]) => ({ sandbox, lastMicros, isTally: sandbox === taskID }));
}
