import type { Clock } from '@heynixie/clock';
import type { Definitions, Log } from '@heynixie/log';

export type ProposalOutcome = 'approved' | 'declined' | 'lapsed' | 'withdrawn';

export type ProposalStatus = 'pending' | ProposalOutcome;

export interface ProposalState {
  readonly proposalID: string;
  readonly thread: string | null;
  readonly proposedAt: number;
  readonly outcome: ProposalOutcome | null;
}

export interface ProposalContext {
  readonly log: Log;
  readonly clock: Pick<Clock, 'now'>;
  readonly definitions: () => Definitions;
}

// One proposer's claim on a proposal: the thread that asked, and the sequence of the record that
// made the claim, which tells a closed task's settlement which run asked.
export interface ProposalStake {
  readonly thread: string;
  readonly sequence: number;
}
