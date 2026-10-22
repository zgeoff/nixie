import type { ProposalLapseSweep } from '@heynixie/proposals';
import { startProposalLapseSweep } from '@heynixie/proposals';
import type { SkillProposalContext } from './types';
import { writeSkillProposalLapses } from './write-skill-proposal-lapses';

export interface SkillLapseSweepOptions {
  readonly context: SkillProposalContext;

  readonly intervalMs?: number;

  readonly onError: (error: unknown) => void;
}

export function startSkillLapseSweep(options: SkillLapseSweepOptions): ProposalLapseSweep {
  return startProposalLapseSweep({
    sweep: () => writeSkillProposalLapses(options.context),
    ...(options.intervalMs === undefined ? {} : { intervalMs: options.intervalMs }),
    onError: options.onError,
  });
}
