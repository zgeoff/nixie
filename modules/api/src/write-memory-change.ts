import type { JSONObject } from '@heynixie/log';
import type { WriteInTransaction } from '@heynixie/memory';
import type { Transaction } from 'kysely';
import { buildInputHash } from './build-input-hash';
import { probeLiveIdentity } from './probe-live-identity';
import { readClientAction } from './read-client-action';
import type { APIContext, Identity } from './types';
import { writeClientAction } from './write-client-action';

export interface MemoryChangeAction {
  readonly clientActionID: string;
  readonly procedure: string;

  // the input the action binds to, and the result that answers it and its retries
  readonly input: JSONObject;
  readonly result: JSONObject;

  // runs the change on the memory store with the action's own write in its transaction
  readonly apply: (writeInTransaction: WriteInTransaction) => Promise<unknown>;
}

// applied: this call or an earlier one with the same ID and input made the change. reused: the ID
// belongs to another action. unauthorized: the caller's session ended before the change committed.
export type MemoryChangeOutcome = 'applied' | 'reused' | 'unauthorized';

// Runs a change from the memory view as a checked action. The action's result commits in the
// change's own transaction, after a check that the caller is still live, so the change and its
// result commit together, and a retry finds the result before the change runs again.
export async function writeMemoryChange(
  context: APIContext,
  caller: Identity,
  action: MemoryChangeAction,
): Promise<MemoryChangeOutcome> {
  const inputHash = buildInputHash(action.input);

  try {
    await action.apply(async (tx) => {
      const settled = await readSettledOutcome(tx, { context, caller, action, inputHash });

      if (settled !== null) {
        throw new SettledChangeError(settled);
      }

      await writeClientAction(tx, {
        clientActionID: action.clientActionID,
        procedure: action.procedure,
        identityID: caller.identityID,
        inputHash,
        result: action.result,
        recordedAt: context.clock.now(),
      });
    });
  } catch (error) {
    if (error instanceof SettledChangeError) {
      return error.outcome;
    }

    throw error;
  }

  return 'applied';
}

interface SettledQuery {
  readonly context: APIContext;
  readonly caller: Identity;
  readonly action: MemoryChangeAction;
  readonly inputHash: string;
}

// the outcome a call gets without a change: refused for a caller no longer live, and for an ID
// that came before, applied for the same caller, procedure and input, or reused
async function readSettledOutcome(
  tx: Transaction<unknown>,
  query: SettledQuery,
): Promise<MemoryChangeOutcome | null> {
  const [live, earlier] = await Promise.all([
    probeLiveIdentity(tx, query.context, query.caller.identityID),
    readClientAction(tx, query.action.clientActionID),
  ]);

  if (!live) {
    return 'unauthorized';
  }

  if (earlier === null) {
    return null;
  }

  return earlier.procedure === query.action.procedure &&
    earlier.identityID === query.caller.identityID &&
    earlier.inputHash === query.inputHash
    ? 'applied'
    : 'reused';
}

// Ends the change's transaction without the change, because the action needs none.
class SettledChangeError extends Error {
  override readonly name = 'SettledChangeError';

  readonly outcome: MemoryChangeOutcome;

  constructor(outcome: MemoryChangeOutcome) {
    super(`the memory change is settled as ${outcome}`);

    this.outcome = outcome;
  }
}
