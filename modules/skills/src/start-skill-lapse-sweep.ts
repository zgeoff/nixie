import type { SkillProposalContext } from './types';
import { writeSkillProposalLapses } from './write-skill-proposal-lapses';

export interface SkillLapseSweepOptions {
  readonly context: SkillProposalContext;

  // how often the sweep runs, hourly by default
  readonly intervalMs?: number;

  // a sweep that fails is logged, and the next one tries again
  readonly onError: (error: unknown) => void;
}

export interface SkillLapseSweep {
  // completes once the sweep in flight, if any, has finished
  readonly stop: () => Promise<void>;
}

// Starts the sweep that records the lapse of each skill proposal past its lapse time, so the
// conversation hears of it in its next turn. A sweep still running when the next one is due lets
// that one pass.
export function startSkillLapseSweep(options: SkillLapseSweepOptions): SkillLapseSweep {
  let running: Promise<void> | null = null;

  const sweep = setInterval(() => {
    running ??= (async () => {
      try {
        await writeSkillProposalLapses(options.context).catch(options.onError);
      } catch {
        // an onError that throws loses only its own report, and the next sweep still runs
      } finally {
        running = null;
      }
    })();
  }, options.intervalMs ?? lapseSweepMs);

  return {
    stop: async () => {
      clearInterval(sweep);

      await running;
    },
  };
}

const lapseSweepMs = 60 * 60 * 1000;
