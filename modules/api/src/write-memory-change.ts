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

  readonly input: JSONObject;
  readonly result: JSONObject;

  readonly apply: (writeInTransaction: WriteInTransaction) => Promise<unknown>;
}

export type MemoryChangeOutcome = 'applied' | 'reused' | 'unauthorized';

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

class SettledChangeError extends Error {
  override readonly name = 'SettledChangeError';

  readonly outcome: MemoryChangeOutcome;

  constructor(outcome: MemoryChangeOutcome) {
    super(`the memory change is settled as ${outcome}`);

    this.outcome = outcome;
  }
}
