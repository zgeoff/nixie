import { proposalOutcomeSchema } from '@heynixie/contract';
import type { JSONObject } from '@heynixie/log';
import type { WriteInTransaction } from '@heynixie/memory';
import { ProposalClosedError } from '@heynixie/memory';
import type { Kysely, Transaction } from 'kysely';
import { buildInputHash } from './build-input-hash';
import { probeLiveIdentity } from './probe-live-identity';
import { readClientAction } from './read-client-action';
import type { APIContext, Identity } from './types';
import { writeClientAction } from './write-client-action';

type StaleCause = 'lapsed' | 'answered' | 'moved' | 'changed' | 'gone';

type RefusalCode =
  | 'CLIENT_ACTION_ID_REUSED'
  | 'PIN_EDIT'
  | 'PINNED_CORE_FULL'
  | 'RETIREMENT_EDIT'
  | 'REVISION_TARGET'
  | 'WRONG_STATE';

export type ProposalOutcome =
  | { readonly proposalID: string; readonly status: 'applied' | 'rejected' }
  | {
      readonly proposalID: string;
      readonly status: 'close_match';
      readonly item: { readonly itemID: string; readonly version: number; readonly text: string };
    }
  | { readonly proposalID: string; readonly status: 'stale'; readonly cause: StaleCause }
  | { readonly proposalID: string; readonly status: 'refused'; readonly code: RefusalCode };

export interface ProposalAnswerAction {
  readonly clientActionID: string;
  readonly procedure: string;
  readonly proposalID: string;

  readonly input: JSONObject;

  readonly committed: ProposalOutcome & JSONObject;

  readonly apply: (writeInTransaction: WriteInTransaction) => Promise<ProposalOutcome | null>;
}

export async function writeProposalAnswer(
  context: APIContext,
  caller: Identity,
  action: ProposalAnswerAction,
): Promise<ProposalOutcome | null> {
  const query = { context, caller, action, inputHash: buildInputHash(action.input) };

  const earlier = await readEarlierOutcome(context.log.writer.db, query);

  if (earlier !== null) {
    return earlier;
  }

  try {
    const outcome = await action.apply((tx) => writeCheckedResult(tx, query));

    return outcome ?? action.committed;
  } catch (error) {
    // an overlapping call with the same ID may have committed first and closed the proposal
    const committed = await readEarlierOutcome(context.log.writer.db, query);

    return committed ?? requireErrorOutcome(action.proposalID, error);
  }
}

interface AnswerQuery {
  readonly context: APIContext;
  readonly caller: Identity;
  readonly action: ProposalAnswerAction;
  readonly inputHash: string;
}

async function readEarlierOutcome(
  db: Kysely<unknown>,
  query: AnswerQuery,
): Promise<ProposalOutcome | null> {
  const earlier = await readClientAction(db, query.action.clientActionID);

  if (earlier === null) {
    return null;
  }

  const isSame =
    earlier.procedure === query.action.procedure &&
    earlier.identityID === query.caller.identityID &&
    earlier.inputHash === query.inputHash;

  return isSame
    ? proposalOutcomeSchema.parse(earlier.result)
    : { proposalID: query.action.proposalID, status: 'refused', code: 'CLIENT_ACTION_ID_REUSED' };
}

async function writeCheckedResult(tx: Transaction<unknown>, query: AnswerQuery): Promise<void> {
  const caller = query.caller;

  if (!(await probeLiveIdentity(tx, query.context, caller.identityID))) {
    throw new SettledAnswerError(null);
  }

  const settled = await readEarlierOutcome(tx, query);

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
  PIN_EDIT: 'PIN_EDIT',
  PINNED_CORE_FULL: 'PINNED_CORE_FULL',
  RETIREMENT_EDIT: 'RETIREMENT_EDIT',
  REVISION_TARGET: 'REVISION_TARGET',

  SELF_NOTE_REFUSED: 'REVISION_TARGET',
  WRONG_STATE: 'WRONG_STATE',
};

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

class SettledAnswerError extends Error {
  override readonly name = 'SettledAnswerError';

  readonly outcome: ProposalOutcome | null;

  constructor(outcome: ProposalOutcome | null) {
    super('the proposal answer is settled');

    this.outcome = outcome;
  }
}
