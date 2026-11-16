import { waitForSettled } from '@heynixie/async';
import type { DefinitionChangeResult, DefinitionsContext } from '@heynixie/definitions';
import { undoDefinitionChange } from '@heynixie/definitions';
import { z } from 'zod';
import type { APIContext, Identity } from '../types';
import { buildInputHash } from '../utils/build-input-hash';
import { probeLiveIdentity } from '../utils/probe-live-identity';
import { readClientAction } from '../utils/read-client-action';
import { writeClientAction } from '../utils/write-client-action';

export interface DefinitionUndo {
  readonly clientActionID: string;
  readonly changeID: string;
}

const storedUndoSchema = z.object({
  definitionID: z.string(),
  changeID: z.string(),
  restored: z.literal('repo').optional(),
});

type StoredUndo = z.output<typeof storedUndoSchema>;

type UndoStop =
  | { readonly status: 'unauthorized' }
  | { readonly status: 'reused' }
  | { readonly status: 'replayed'; readonly undone: StoredUndo };

export type DefinitionUndoRun =
  | { readonly status: 'done'; readonly undone: StoredUndo }
  | Exclude<UndoStop, { status: 'replayed' }>
  | {
      readonly status: 'refused';
      readonly refusal: Extract<DefinitionChangeResult, { status: 'refused' }>['refusal'];
    };

const pendingUndos = new WeakMap<object, Promise<void>>();

// A change takes effect through its seed, and a later one checks the version that the earlier one
// left, so undos run one at a time. The caller check and the client action sit in the undo's own
// write transaction, so a replay writes no second change and a refusal stores no client action.
export function runDefinitionUndo(
  context: APIContext,
  definitions: DefinitionsContext,
  caller: Identity,
  undo: DefinitionUndo,
): Promise<DefinitionUndoRun> {
  const queued = waitThenRunUndo(pendingUndos.get(context.log.writer), {
    context,
    definitions,
    caller,
    undo,
  });

  pendingUndos.set(context.log.writer, waitForSettled(queued));

  return queued;
}

interface UndoRunInput {
  readonly context: APIContext;
  readonly definitions: DefinitionsContext;
  readonly caller: Identity;
  readonly undo: DefinitionUndo;
}

async function waitThenRunUndo(
  previous: Promise<void> | undefined,
  input: UndoRunInput,
): Promise<DefinitionUndoRun> {
  await previous;

  const context = input.context;
  const caller = input.caller;
  const undo = input.undo;
  const procedure = 'definitions.undo';
  const inputHash = buildInputHash({ changeID: undo.changeID });

  const result = await undoDefinitionChange<UndoStop>(input.definitions, undo.changeID, {
    before: async (tx) => {
      if (!(await probeLiveIdentity(tx, context, caller.identityID))) {
        return { status: 'unauthorized' };
      }

      const earlier = await readClientAction(tx, undo.clientActionID);

      if (earlier === null) {
        return null;
      }

      const stored = storedUndoSchema.safeParse(earlier.result);

      const isSame =
        earlier.procedure === procedure &&
        earlier.identityID === caller.identityID &&
        earlier.inputHash === inputHash;

      return isSame && stored.success
        ? { status: 'replayed', undone: stored.data }
        : { status: 'reused' };
    },

    after: async (tx, change) => {
      await writeClientAction(tx, {
        clientActionID: undo.clientActionID,
        procedure,
        identityID: caller.identityID,
        inputHash,
        result: {
          definitionID: change.definitionID,
          changeID: change.changeID,
          ...(change.restored === null ? {} : { restored: change.restored }),
        },
        recordedAt: context.clock.now(),
      });
    },
  });

  if ('refusal' in result) {
    return { status: 'refused', refusal: result.refusal };
  }

  if (result.status === 'replayed') {
    return { status: 'done', undone: result.undone };
  }

  if (result.status === 'changed') {
    return {
      status: 'done',
      undone: {
        definitionID: result.definitionID,
        changeID: result.changeID,
        ...(result.restored === undefined ? {} : { restored: result.restored }),
      },
    };
  }

  return result;
}
