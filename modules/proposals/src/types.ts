import type { Clock } from '@heynixie/clock';
import type { Definitions, Log } from '@heynixie/log';

export type ProposalOutcome = 'approved' | 'rejected' | 'lapsed';

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
