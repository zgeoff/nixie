import type { Clock } from '@heynixie/clock';
import type { Definitions, Log, Projection, RecordInput } from '@heynixie/log';
import type { Transaction } from 'kysely';
import type { ProposalFamily } from '../rows/proposal-tables';
import type { QuietHours } from '../sweeps/pick-return-at';
import type {
  AnswerResult,
  ProposalAnswerInput,
  ProposalConfig,
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

  // the lapse of each family, as the server config sets it
  readonly config: ProposalConfig;

  // the thread of nixie's one conversation, which hears the lapse of a proposal with no proposer
  readonly conversationThread: string;

  // Where a settlement for a proposer's thread goes. A task that has closed sends it to the report
  // target of its run, with the task's name.
  readonly readSettlementTarget: (
    tx: Transaction<unknown>,
    thread: string,
  ) => Promise<{ readonly thread: string; readonly task: string | null }>;

  // Writes a record on a row's thread. A task that is still open takes it as an inbox record.
  readonly writeThreadRecord: (tx: Transaction<unknown>, input: RecordInput) => Promise<void>;
}

// What a family needs to propose, withdraw and settle a proposal, without the answer path's own
// parts.
export type ProposeDeps = Pick<
  ProposalCoreDeps,
  | 'log'
  | 'clock'
  | 'definitions'
  | 'config'
  | 'handlers'
  | 'writeThreadRecord'
  | 'readSettlementTarget'
  | 'conversationThread'
>;

export type AnswerSettlement =
  | { readonly status: 'answered'; readonly result: AnswerResult }
  | { readonly status: 'refused'; readonly refusal: ProposalRefusal };

export type PasskeyFailure =
  | 'unknown_challenge'
  | 'binding'
  | 'unknown_passkey'
  | 'origin'
  | 'no_user_verification'
  | 'signature'
  | 'counter';

export type PasskeyRefusal =
  | { readonly error: 'PASSKEY_REQUIRED' }
  | { readonly error: 'NO_PASSKEY' }
  | { readonly error: 'PASSKEY_FAILED'; readonly reason: PasskeyFailure };

// A passkey refusal is never a settlement: nothing is stored under the client action ID, so a retry
// with a fresh assertion runs every check again.
export type AnswerOutcome =
  | AnswerSettlement
  | { readonly status: 'unauthorized' }
  | { readonly status: 'passkey_refused'; readonly refusal: PasskeyRefusal };

// Who answers decides how a gated choice passes: a host command needs no passkey, a device route
// checks one, and a route that names neither is refused.
export type PasskeyGate =
  | { readonly kind: 'host' }
  | {
      readonly kind: 'device';

      // Returns null when the assertion passes, after it writes what the pass changes in the
      // answer's transaction.
      readonly check: (
        tx: Transaction<unknown>,
        row: SharedProposal,
        answer: ProposalAnswerInput,
      ) => Promise<PasskeyRefusal | null>;
    };

export interface AnswerHooks {
  // a route that answers one kind only never reaches a row of another
  readonly family?: ProposalFamily;

  // runs first, in the answer's transaction; false stops the answer with nothing written
  readonly probeCaller?: (tx: Transaction<unknown>) => Promise<boolean>;

  // the passkey gate of a choice that takes one; with none, such a choice is refused
  readonly passkey?: PasskeyGate;

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
