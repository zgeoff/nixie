import type { Kysely, Transaction } from 'kysely';
import type {
  ProposalFamily,
  ProposalKind,
  ProposalRiskClass,
  SharedProposalState,
} from '../rows/proposal-tables';

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

  // an edit of a skill's files, on approve
  readonly files?: readonly { readonly path: string; readonly text: string }[] | undefined;
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

export type ApplyOutcome =
  | {
      readonly status: 'done';
      readonly result: AnswerResult;
      readonly afterCommit?: () => Promise<void>;
    }
  | { readonly status: 'refused'; readonly refusal: ProposalRefusal };

export interface ApplyRun {
  // null for a kind that owns its transaction: the kind then calls guard inside its own
  readonly tx: Transaction<unknown> | null;
  readonly guard: (tx: Transaction<unknown>) => Promise<void>;
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
  readonly lapseIntervalMs: number;

  // A kind whose writes open their own transaction. It runs apply with no transaction and calls
  // the guard from inside its own.
  readonly ownsTransaction: boolean;
  readonly readBodies: (
    db: Kysely<unknown>,
    rows: readonly SharedProposal[],
  ) => Promise<ReadonlyMap<string, ProposalBody | null>>;
  readonly readHashes: (db: Kysely<unknown>, row: SharedProposal) => Promise<ProposalHashes>;
  readonly approve: (
    run: ApplyRun,
    row: SharedProposal,
    answer: ProposalAnswerInput,
  ) => Promise<ApplyOutcome>;
  readonly decline: (
    run: ApplyRun,
    row: SharedProposal,
    answer: ProposalAnswerInput,
  ) => Promise<ApplyOutcome>;

  // writes the kind's own lapse record
  readonly lapse: (tx: Transaction<unknown>, row: SharedProposal) => Promise<void>;
}
