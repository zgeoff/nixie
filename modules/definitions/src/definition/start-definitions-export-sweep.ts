import type { Clock, Sweep } from '@heynixie/clock';
import { startSweep, systemClock } from '@heynixie/clock';
import type { DefinitionsExportOptions } from '../skill/run-definitions-exports';
import { runDefinitionsExports } from '../skill/run-definitions-exports';

export interface DefinitionsExportSweepOptions extends DefinitionsExportOptions {
  readonly intervalMs?: number;

  readonly clock?: Clock;
}

export type DefinitionsExportSweep = Sweep;

const exportSweepMs = 60 * 60 * 1000;

export function startDefinitionsExportSweep(
  options: DefinitionsExportSweepOptions,
): DefinitionsExportSweep {
  return startSweep({
    clock: options.clock ?? systemClock,
    intervalMs: options.intervalMs ?? exportSweepMs,
    run: () => runDefinitionsExports(options),
    onError: options.onError,
    runOnStart: true,
  });
}
