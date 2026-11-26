import type { Kysely, Transaction } from 'kysely';
import type {
  ProposalFamily,
  ProposalKind,
  ProposalRiskClass,
  SharedProposalState,
} from '../rows/proposal-tables';
import type { ProposalStake } from '../types';

export interface SharedProposal {
  readonly id: string;
  readonly shortID: string;
  readonly family: ProposalFamily;
  readonly kind: ProposalKind;
  readonly riskClass: ProposalRiskClass;
  readonly actionHash: string;
  readonly ruleHash: string | null;
  readonly cause: string;
  readonly taskID: string | null;
  readonly thread: string | null;
  readonly createdSequence: number;
  readonly createdAt: number;
  readonly lapsesAt: number;
  readonly deadlineAt: number | null;
  readonly state: SharedProposalState;
  readonly usedBy: string | null;

  // the identity whose answer closed the row, null when none did
  readonly answeredBy: string | null;
  readonly deferGeneration: number;
  readonly deferUntil: number | null;
  readonly returnAt: number | null;

  // the key that makes a new proposal replace this one, null for a family that never replaces
  readonly sameThing: string | null;
}

export type ProposalChoice = 'approve' | 'always_allow' | 'defer' | 'decline';

export interface ProposalAnswerInput {
  readonly proposalID: string;

  // null for a caller that has no hash to echo, such as a route that predates the hash
  readonly actionHash: string | null;
  readonly choice: ProposalChoice;
  readonly ruleHash?: string | undefined;

  // epoch ms
  readonly deferUntil?: number | undefined;
  readonly note?: string | undefined;
  readonly identityID: string;

  // where the answer came from; a host command when absent
  readonly channel?: 'host' | 'browser' | undefined;

  // an edit of a skill's files, on approve
  readonly files?: readonly { readonly path: string; readonly text: string }[] | undefined;

  // an edit of a prompt override's entry and part files, on approve
  readonly prompt?:
    | {
        readonly entry?: Readonly<Record<string, string>> | undefined;
        readonly files?: readonly { readonly path: string; readonly text: string }[] | undefined;
      }
    | undefined;
  readonly memory?:
    | {
        readonly editedText?: string | undefined;
        readonly revisionOf?: { readonly itemID: string; readonly version: number } | undefined;
        readonly ignoreCloseMatch?: boolean | undefined;
      }
    | undefined;
}

export type AnswerResult =
  | {
      readonly proposalID: string;
      readonly state: 'approved';
      readonly rule?: { readonly id: string; readonly revision: number };
    }
  | { readonly proposalID: string; readonly state: 'declined' | 'deferred' }
  | {
      readonly proposalID: string;
      readonly state: 'pending';
      readonly closeMatch: {
        readonly itemID: string;
        readonly text: string;
        readonly version: number;
      };
    };

export type ProposalRefusal =
  | { readonly error: 'NOT_FOUND' }
  | { readonly error: 'CLOSED'; readonly state: SharedProposalState }
  | {
      readonly error: 'CONFLICT';
      readonly current: { readonly actionHash: string; readonly ruleHash: string | null };
    }
  | { readonly error: 'NOT_ALLOWED'; readonly reason: string };

export type DoneOutcome = Extract<ApplyOutcome, { readonly status: 'done' }>;

// The result of a lapse or a withdrawal, which no answer returns.
export interface ClosedResult {
  readonly proposalID: string;
  readonly state: 'lapsed' | 'withdrawn';
}

export type ApplyOutcome =
  | {
      readonly status: 'done';
      readonly result: AnswerResult | ClosedResult;
      readonly afterCommit?: () => Promise<void>;

      // the ID the apply made, such as memory's approval; goes into the settlement
      readonly usedBy: string | null;

      // the family's own line for the proposer, such as "call skill_reload"
      readonly detail: string | null;

      // the stakes of the other proposers of a merged proposal, which also hear the settlement
      readonly otherStakes: readonly ProposalStake[];
    }
  | { readonly status: 'refused'; readonly refusal: ProposalRefusal };

export interface ApplyRun {
  // null for a kind that owns its transaction: the kind then calls guard inside its own
  readonly tx: Transaction<unknown> | null;
  readonly guard: (tx: Transaction<unknown>) => Promise<void>;

  // Writes proposals.settled from a done outcome. A family that owns its transaction calls it
  // inside that transaction, after its apply; for any other family the core calls it.
  readonly settle: (tx: Transaction<unknown>, outcome: DoneOutcome) => Promise<void>;
}

export interface ProposalBody {
  readonly sentence: string;
  readonly fields: Readonly<Record<string, string>>;
  readonly ruleSentence: string | null;

  // the IDs of stored images that the card shows, such as the photos a draw would send
  readonly images?: string[];

  // The desktop as it was when a screen click was prepared, with the point the click lands on. The
  // picture's ID is read through the same route as an image's.
  readonly screen?: { readonly x: number; readonly y: number; readonly picture: string };

  // The package that a package install adds, which the card shows beside its fields: the
  // publisher's own words in `description` are marked as such.
  readonly package?: {
    readonly name: string;
    readonly version: string;
    readonly unpackedBytes: number | null;
    readonly publisher: string;
    readonly description: string;
    readonly integrity: string;
  };

  // the approve button's text, built from the kind's template and never from a model
  readonly approveLabel: string;

  // the rule form that a proposed rule's card opens in its Edit
  readonly rule?: Readonly<Record<string, unknown>>;
}

export interface ProposalHashes {
  readonly action: string;
  readonly rule: string | null;
}

// actions, memory, skills and the rule changes of definitions each register one
export interface ProposalKindHandler {
  readonly family: ProposalFamily;

  // Replaces a fixed lapse time. The server loads the config at start, so a changed value applies
  // after a restart, to the next proposal and the next defer. Null for a cause that lapses only
  // at its deadline, such as a mandate.
  readonly lapseIntervalMs: (config: ProposalConfig, cause: string) => number | null;

  // A kind whose writes open their own transaction. It runs apply with no transaction and calls
  // the guard from inside its own.
  readonly ownsTransaction: boolean;
  readonly readBodies: (
    db: Kysely<unknown>,
    rows: readonly SharedProposal[],
  ) => Promise<ReadonlyMap<string, ProposalBody | null>>;

  // The one-line description that a settlement carries, for a family whose bodies read outside the
  // transaction that settles. The settlement reads the body instead when this is absent.
  readonly readSentence?: (db: Kysely<unknown>, row: SharedProposal) => Promise<string | null>;
  readonly readHashes: (db: Kysely<unknown>, row: SharedProposal) => Promise<ProposalHashes>;
  readonly approve: (
    run: ApplyRun,
    row: SharedProposal,
    answer: ProposalAnswerInput,
  ) => Promise<ApplyOutcome>;

  // Undoes what the proposal held, such as a held action or a sealed body. It runs where approve
  // runs. On a decline it may refuse, and a refusal leaves the row open; on a lapse or a
  // withdrawal it never refuses. The answer is null on a lapse or a withdrawal.
  readonly discard: (
    run: ApplyRun,
    row: SharedProposal,
    outcome: DiscardOutcome,
    answer: ProposalAnswerInput | null,
  ) => Promise<ApplyOutcome>;
}

export type DiscardOutcome = 'declined' | 'lapsed' | 'withdrawn';

export interface ProposalConfig {
  // days a proposal of each family waits before it lapses
  readonly lapseDays: Readonly<Record<ProposalFamily, number>>;
}
