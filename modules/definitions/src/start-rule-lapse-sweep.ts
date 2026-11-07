import type { Clock } from '@heynixie/clock';
import type { ProposalContext, ProposalLapseSweep } from '@heynixie/proposals';
import { startProposalLapseSweep } from '@heynixie/proposals';
import { writeRuleProposalLapses } from './write-rule-proposal-lapses';

export interface RuleLapseSweepOptions {
  readonly context: ProposalContext;

  readonly clock: Clock;

  readonly onError: (error: unknown) => void;
}

export function startRuleLapseSweep(options: RuleLapseSweepOptions): ProposalLapseSweep {
  return startProposalLapseSweep({
    sweep: () => writeRuleProposalLapses(options.context),
    clock: options.clock,
    onError: options.onError,
  });
}
