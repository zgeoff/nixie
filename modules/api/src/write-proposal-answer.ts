import type { JSONObject } from '@heynixie/log';
import type { WriteInTransaction } from '@heynixie/memory';
import { ProposalClosedError } from '@heynixie/memory';
import type { Kysely, Transaction } from 'kysely';
import { buildInputHash } from './build-input-hash';
import { findClientAction } from './find-client-action';
import { isLiveIdentity } from './is-live-identity';
import type { APIContext, Identity } from './types';
import { writeClientAction } from './write-client-action';

// The outcome of one answer to a proposal, as the contract declares it.
export type ProposalOutcome =
  | { readonly proposalID: string; readonly status: 'applied' | 'rejected' }
  | {
      readonly proposalID: string;
      readonly status: 'close_match';
      readonly item: { readonly itemID: string; readonly version: number; readonly text: string };
    }
  | { readonly proposalID: string; readonly status: 'stale'; readonly cause: StaleCause }
  | { readonly proposalID: string; readonly status: 'refused'; readonly code: RefusalCode };

type StaleCause = 'lapsed' | 'answered' | 'moved' | 'changed' | 'gone';

type RefusalCode =
  | 'CLIENT_ACTION_ID_REUSED'
  | 'PINNED_CORE_FULL'
  | 'RETIREMENT_EDIT'
  | 'REVISION_TARGET'
  | 'WRONG_STATE';

export interface ProposalAnswerAction {
  readonly clientActionID: string;
  readonly procedure: string;
  readonly proposalID: string;

  // the input the action binds to, with no free text: its hash would confirm a guess at the text
  readonly input: JSONObject;

  // the outcome that answers the action and its retries once the answer commits
  readonly committed: ProposalOutcome & JSONObject;

  // answers the proposal with the action's own write in its transaction, and returns the outcome
  // of an answer that commits nothing, such as a close match
  readonly apply: (writeInTransaction: WriteInTransaction) => Promise<ProposalOutcome | null>;
}

// Runs one answer to a proposal as a checked action, whose result commits in the answer's own
// transaction. An answer the store refuses writes nothing and reads as stale or refused, and a
// caller whose session ended before the answer committed gets null.
export async function writeProposalAnswer(
  context: APIContext,
  caller: Identity,
  action: ProposalAnswerAction,
): Promise<ProposalOutcome | null> {
  const query = { context, caller, action, inputHash: buildInputHash(action.input) };

  // a committed answer closes its proposal, so a retry finds its first outcome before it runs
  const earlier = await findEarlierOutcome(context.log.writer.db, query);

  if (earlier !== null) {
    return earlier;
  }

  try {
    const outcome = await action.apply((tx) => writeCheckedResult(tx, query));

    return outcome ?? action.committed;
  } catch (error) {
    // an overlapping call with the same ID may have committed first and closed the proposal
    const committed = await findEarlierOutcome(context.log.writer.db, query);

    return committed ?? requireErrorOutcome(action.proposalID, error);
  }
}

interface AnswerQuery {
  readonly context: APIContext;
  readonly caller: Identity;
  readonly action: ProposalAnswerAction;
  readonly inputHash: string;
}

// the first outcome of an action whose ID came before: its own for the same caller, procedure and
// input, or a refusal of the reused ID
async function findEarlierOutcome(
  db: Kysely<unknown>,
  query: AnswerQuery,
): Promise<ProposalOutcome | null> {
  const earlier = await findClientAction(db, query.action.clientActionID);

  if (earlier === null) {
    return null;
  }

  const isSame =
    earlier.procedure === query.action.procedure &&
    earlier.identityID === query.caller.identityID &&
    earlier.inputHash === query.inputHash;

  return isSame
    ? // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- writeProposalAnswer wrote a ProposalOutcome
      (earlier.result as ProposalOutcome)
    : { proposalID: query.action.proposalID, status: 'refused', code: 'CLIENT_ACTION_ID_REUSED' };
}

// Keeps the action's result in the answer's transaction once the caller is still live and no
// earlier action holds the ID, and otherwise ends the transaction without the answer.
async function writeCheckedResult(tx: Transaction<unknown>, query: AnswerQuery): Promise<void> {
  const caller = query.caller;

  if (!(await isLiveIdentity(tx, query.context, caller.identityID))) {
    throw new SettledAnswerError(null);
  }

  const settled = await findEarlierOutcome(tx, query);

  if (settled !== null) {
    throw new SettledAnswerError(settled);
  }

  await writeClientAction(tx, {
    clientActionID: query.action.clientActionID,
    procedure: query.action.procedure,
    identityID: caller.identityID,
    inputHash: query.inputHash,
    result: query.action.committed,
    recordedAt: query.context.clock.now(),
  });
}

// the outcome an answer that ended without committing gets, or the error again when the store gave
// no code an outcome names
function requireErrorOutcome(proposalID: string, error: unknown): ProposalOutcome | null {
  if (error instanceof SettledAnswerError) {
    return error.outcome;
  }

  const outcome = findRefusedOutcome(proposalID, error);

  if (outcome === null) {
    throw error;
  }

  return outcome;
}

const staleCauses: Readonly<Record<string, StaleCause | undefined>> = {
  NOT_FOUND: 'gone',
  PROPOSAL_HASH: 'changed',
  STALE_VERSION: 'moved',
};

const refusalCodes: Readonly<Record<string, RefusalCode | undefined>> = {
  PINNED_CORE_FULL: 'PINNED_CORE_FULL',
  RETIREMENT_EDIT: 'RETIREMENT_EDIT',
  REVISION_TARGET: 'REVISION_TARGET',

  // an approval meets a self-note's refusal only as a revision of an item of the other kind
  SELF_NOTE_REFUSED: 'REVISION_TARGET',
  WRONG_STATE: 'WRONG_STATE',
};

// the outcome of an answer the memory store refused with a typed error, or null for any other
// error; a lapsed proposal and one already answered both read as stale
function findRefusedOutcome(proposalID: string, error: unknown): ProposalOutcome | null {
  if (error instanceof ProposalClosedError) {
    return {
      proposalID,
      status: 'stale',
      cause: error.status === 'lapsed' ? 'lapsed' : 'answered',
    };
  }

  const code = error instanceof Error && 'code' in error ? error.code : null;

  if (typeof code !== 'string') {
    return null;
  }

  const cause = staleCauses[code];

  if (cause !== undefined) {
    return { proposalID, status: 'stale', cause };
  }

  const refusal = refusalCodes[code];

  return refusal === undefined ? null : { proposalID, status: 'refused', code: refusal };
}

// Ends the answer's transaction without the answer, because the action needs none: null when the
// caller's session ended, or the earlier outcome of the same action.
class SettledAnswerError extends Error {
  override readonly name = 'SettledAnswerError';

  readonly outcome: ProposalOutcome | null;

  constructor(outcome: ProposalOutcome | null) {
    super('the proposal answer is settled');

    this.outcome = outcome;
  }
}
