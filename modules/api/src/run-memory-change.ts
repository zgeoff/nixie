// oxlint-disable new-cap -- oRPC names a procedure's typed errors by their upper-case codes
import { requireCaller } from './require-caller';
import { requireViewMemory } from './require-view-memory';
import { toMemoryChangeError } from './to-memory-change-error';
import type { APIContext, ReadViewMemory, ViewMemoryStore } from './types';
import type { MemoryChangeAction } from './write-memory-change';
import { writeMemoryChange } from './write-memory-change';

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
  readonly context: { readonly sessionToken: string | undefined };
  readonly errors: ChangeErrors;
}

interface ChangeParts {
  readonly context: APIContext;
  readonly readMemory: ReadViewMemory;
}

// Resolves the caller, waits for the store, and runs the change as a checked action, answering a
// refusal with the typed error the procedure declares for it. It returns the store the change ran
// on.
export async function runMemoryChange(
  parts: ChangeParts,
  call: ChangeCall,
  buildAction: (store: ViewMemoryStore) => MemoryChangeAction,
): Promise<ViewMemoryStore> {
  const caller = await requireCaller(
    parts.context,
    call.context.sessionToken,
    call.errors.UNAUTHORIZED,
  );

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

  return store;
}
