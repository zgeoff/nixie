// oxlint-disable new-cap -- oRPC names a procedure's typed errors by their upper-case codes
import type { Provenance } from '@heynixie/memory';
import { apiImplementer } from './api-implementer';
import { requireCaller } from './require-caller';
import { requireViewMemory } from './require-view-memory';
import { toMemoryChangeError } from './to-memory-change-error';
import type { APIContext, ReadViewMemory, ViewMemoryStore } from './types';
import type { MemoryChangeAction } from './write-memory-change';
import { writeMemoryChange } from './write-memory-change';

// Builds the memory view's changes for a signed-in device: retire, restore, pin and unpin, each a
// checked action bound to the version the view showed, with you as its origin and its source.
export function buildMemoryChangeProcedures(context: APIContext, readMemory: ReadViewMemory) {
  const memory = apiImplementer.memory;
  const parts = { context, readMemory };

  return {
    retire: memory.retire.handler(async (options) => {
      const target = { itemID: options.input.itemID, version: options.input.version };
      const result = { itemID: target.itemID, version: target.version + 1 };

      await runMemoryChange(parts, toChangeCall(options), (store) => ({
        clientActionID: options.input.clientActionID,
        procedure: 'memory.retire',
        input: target,
        result,
        apply: (writeInTransaction) =>
          store.retire({ target, provenance: ownerProvenance, writeInTransaction }),
      }));

      return result;
    }),

    restore: memory.restore.handler(async (options) => {
      const target = { itemID: options.input.itemID, version: options.input.version };
      const result = { itemID: target.itemID, version: target.version + 1 };

      await runMemoryChange(parts, toChangeCall(options), (store) => ({
        clientActionID: options.input.clientActionID,
        procedure: 'memory.restore',
        input: target,
        result,
        apply: (writeInTransaction) =>
          store.restore({ target, provenance: ownerProvenance, writeInTransaction }),
      }));

      return result;
    }),

    pin: memory.pin.handler(async (options) => {
      const { clientActionID, ...input } = options.input;
      const result = { itemID: input.itemID, isPinned: input.isPinned };

      await runMemoryChange(parts, toChangeCall(options), (store) => ({
        clientActionID,
        procedure: 'memory.pin',
        input,
        result,
        apply: (writeInTransaction) =>
          store.pin({ ...input, provenance: ownerProvenance, writeInTransaction }),
      }));

      return result;
    }),
  };
}

// your own change, as in the host commands: you are its origin and its source
const ownerProvenance: Provenance = {
  origin: 'owner',
  source: 'owner',
  taskID: null,
  proposalID: null,
  checks: null,
};

interface ChangeErrors {
  readonly UNAUTHORIZED: () => Error;
  readonly MEMORY_NOT_STARTED: () => Error;
  readonly CLIENT_ACTION_ID_REUSED: () => Error;
  readonly MEMORY_ITEM_NOT_FOUND: () => Error;
  readonly STALE_VERSION: () => Error;
  readonly WRONG_STATE: () => Error;
  readonly PINNED_CORE_FULL?: () => Error;
}

// what a change reads of its call: the caller's session and the errors its procedure declares
interface ChangeCall {
  readonly sessionToken: string | undefined;
  readonly errors: ChangeErrors;
}

interface ChangeOptions {
  readonly context: { readonly sessionToken: string | undefined };
  readonly errors: ChangeErrors;
}

function toChangeCall(options: ChangeOptions): ChangeCall {
  return { sessionToken: options.context.sessionToken, errors: options.errors };
}

interface ChangeParts {
  readonly context: APIContext;
  readonly readMemory: ReadViewMemory;
}

// Resolves the caller, waits for the store, and runs the change as a checked action, answering a
// refusal with the typed error the procedure declares for it.
async function runMemoryChange(
  parts: ChangeParts,
  call: ChangeCall,
  buildAction: (store: ViewMemoryStore) => MemoryChangeAction,
): Promise<void> {
  const caller = await requireCaller(parts.context, call.sessionToken, call.errors.UNAUTHORIZED);

  const store = requireViewMemory(parts.readMemory, call.errors.MEMORY_NOT_STARTED);

  const outcome = await writeMemoryChange(parts.context, caller, buildAction(store)).catch(
    (error: unknown) => {
      throw toMemoryChangeError(error, call.errors);
    },
  );

  if (outcome === 'unauthorized') {
    throw call.errors.UNAUTHORIZED();
  }

  if (outcome === 'reused') {
    throw call.errors.CLIENT_ACTION_ID_REUSED();
  }
}
