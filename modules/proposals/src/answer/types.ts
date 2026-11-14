import type { Clock } from '@heynixie/clock';
import type { Definitions, Log, Projection, RecordInput } from '@heynixie/log';
import type { Transaction } from 'kysely';
import type { ProposalFamily } from '../rows/proposal-tables';
import type { QuietHours } from '../sweeps/pick-return-at';
import type {
  AnswerResult,
  ProposalKindHandler,
  ProposalRefusal,
  SharedProposal,
} from './proposal-kind-handler';

export interface ProposalCoreDeps {
  readonly log: Pick<Log, 'writer' | 'deploymentKey' | 'projections'>;
  readonly clock: Pick<Clock, 'now'>;
  readonly definitions: () => Definitions;
  readonly handlers: ReadonlyMap<ProposalFamily, ProposalKindHandler>;

  // the proposals projection, which builds a row that the log holds no row for
  readonly projection: Projection;

  // quiet hours and the owner's time zone, as the server reads them
  readonly readDeferContext: (tx: Transaction<unknown>) => Promise<{
    readonly quietHours: QuietHours | null;
    readonly zone: string;
  }>;

  // Writes a record on a row's thread. A task that is still open takes it as an inbox record.
  readonly writeThreadRecord: (tx: Transaction<unknown>, input: RecordInput) => Promise<void>;
}

export type AnswerSettlement =
  | { readonly status: 'answered'; readonly result: AnswerResult }
  | { readonly status: 'refused'; readonly refusal: ProposalRefusal };

export type AnswerOutcome = AnswerSettlement | { readonly status: 'unauthorized' };

export interface AnswerHooks {
  // a route that answers one kind only never reaches a row of another
  readonly family?: ProposalFamily;

  // runs first, in the answer's transaction; false stops the answer with nothing written
  readonly probeCaller?: (tx: Transaction<unknown>) => Promise<boolean>;

  // runs in the answer's transaction, after the answer or its refusal is decided
  readonly writeSettlement?: (
    tx: Transaction<unknown>,
    settlement: AnswerSettlement,
  ) => Promise<void>;
}

export type Checked =
  | {
      readonly status: 'checked';
      readonly row: SharedProposal;
      readonly handler: ProposalKindHandler;
    }
  | { readonly status: 'refused'; readonly refusal: ProposalRefusal };
