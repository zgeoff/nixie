import { toMicrosUp } from './to-micros-up';

// One read of a sandbox's count, as the `task.meter_read` record holds it.
export interface MeterRead {
  readonly sandbox: string;
  readonly reason: string;
  readonly countMicros: number;
}

// A task run's dollars in whole micros: per sandbox, the last count less the count at the task run's
// start (zero for a sandbox first read later), summed, plus its worker runs' dollars.
export function pickTaskRunMicros(reads: readonly MeterRead[], workerDollars: number): number {
  const sandboxes = new Map<string, { baseMicros: number; lastMicros: number }>();

  for (const read of reads) {
    const held = sandboxes.get(read.sandbox);

    if (held === undefined) {
      const baseMicros = read.reason === 'run_start' ? read.countMicros : 0;

      sandboxes.set(read.sandbox, { baseMicros, lastMicros: read.countMicros });
    } else {
      held.lastMicros = Math.max(held.lastMicros, read.countMicros);
    }
  }

  let micros = 0;

  for (const held of sandboxes.values()) {
    micros += Math.max(0, held.lastMicros - held.baseMicros);
  }

  return micros + toMicrosUp(workerDollars);
}
