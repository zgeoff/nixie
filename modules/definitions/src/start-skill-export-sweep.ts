import type { SkillExportOptions } from './run-skill-exports';
import { runSkillExports } from './run-skill-exports';

export interface SkillExportSweepOptions extends SkillExportOptions {
  // how often the sweep retries what failed, hourly by default
  readonly intervalMs?: number;
}

export interface SkillExportSweep {
  // runs the exports now, or once more after the run in flight
  readonly wake: () => void;

  // completes once the run in flight, if any, has finished
  readonly stop: () => Promise<void>;
}

const exportSweepMs = 60 * 60 * 1000;

// Starts the export of the skills that nixie wrote to your definitions repo: one run at start, one
// on each wake after an approval or your choice on a conflict, and one each interval, which tries
// a failed export again. Runs never overlap, and a wake during a run queues one run after it.
export function startSkillExportSweep(options: SkillExportSweepOptions): SkillExportSweep {
  let running: Promise<void> | null = null;
  let isWoken = false;
  let isStopped = false;

  const run = () => {
    if (running !== null) {
      isWoken = true;

      return;
    }

    running = (async () => {
      do {
        isWoken = false;

        try {
          await runSkillExports(options).catch(options.onError);
        } catch {
          // an onError that throws loses only its own report, and the next run still goes
        }
      } while (isWoken);

      running = null;
    })();
  };

  const sweep = setInterval(run, options.intervalMs ?? exportSweepMs);

  run();

  return {
    wake: () => {
      if (!isStopped) {
        run();
      }
    },
    stop: async () => {
      isStopped = true;

      clearInterval(sweep);

      await running;
    },
  };
}
