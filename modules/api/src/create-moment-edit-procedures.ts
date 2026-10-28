// oxlint-disable new-cap -- oRPC names a procedure's typed errors by their upper-case codes
import type { MomentStore } from '@heynixie/memory';
import { apiImplementer } from './api-implementer';
import { MomentRefusedError } from './moment-refused-error';
import { requireCaller } from './require-caller';
import { requireViewMemory } from './require-view-memory';
import { toMomentError } from './to-moment-error';
import type { APIContext, ReadViewMemory, ViewMemoryStore } from './types';
import type { MemoryChangeAction } from './write-memory-change';
import { writeMemoryChange } from './write-memory-change';

export function createMomentEditProcedures(context: APIContext, readMemory: ReadViewMemory) {
  const memory = apiImplementer.memory;
  const parts = { context, readMemory };

  return {
    editMoment: memory.editMoment.handler(async (options) => {
      const input = options.input;
      const target = { momentID: input.momentID, version: input.version };
      const result = { momentID: input.momentID, version: input.version + 1 };

      await runMomentChange(parts, options, (store) => ({
        clientActionID: input.clientActionID,
        procedure: 'memory.editMoment',
        input: { ...target, change: { ...input.change } },
        result,
        apply: async (writeInTransaction) => {
          const edited = await store.moments.edit(
            { caller: { kind: 'owner' }, target, change: input.change },
            writeInTransaction,
          );

          throwRefusal(edited);
        },
      }));

      return result;
    }),

    linkMoment: memory.linkMoment.handler(async (options) => {
      const input = options.input;
      const target = { momentID: input.momentID, version: input.version };
      const result = { momentID: input.momentID, version: input.version + 1 };

      await runMomentChange(parts, options, async (store) => {
        const found = await store.readItemIDMap([input.itemID]);

        const itemID = found.get(input.itemID) ?? input.itemID;

        return {
          clientActionID: input.clientActionID,
          procedure: 'memory.linkMoment',
          input: { ...target, itemID, isLinked: input.isLinked },
          result,
          apply: async (writeInTransaction) => {
            const linked = await store.moments.link(
              { caller: { kind: 'owner' }, target, itemID, isLinked: input.isLinked },
              writeInTransaction,
            );

            throwRefusal(linked);
          },
        };
      });

      return result;
    }),
  };
}

interface MomentChangeErrors {
  readonly UNAUTHORIZED: () => Error;
  readonly MEMORY_NOT_STARTED: () => Error;
  readonly CLIENT_ACTION_ID_REUSED: () => Error;
  readonly MOMENT_NOT_FOUND: () => Error;
  readonly STALE_VERSION: () => Error;
  readonly BAD_SPAN?: () => Error;
  readonly REFLECTION_NOT_FOUND?: () => Error;
  readonly MEMORY_ITEM_NOT_FOUND?: () => Error;
  readonly ALREADY_LINKED?: () => Error;
  readonly NOT_LINKED?: () => Error;
}

interface MomentChangeCall {
  readonly context: { readonly sessionToken: string | undefined };
  readonly errors: MomentChangeErrors;
}

interface MomentChangeParts {
  readonly context: APIContext;
  readonly readMemory: ReadViewMemory;
}

async function runMomentChange(
  parts: MomentChangeParts,
  call: MomentChangeCall,
  buildAction: (store: ViewMemoryStore) => MemoryChangeAction | Promise<MemoryChangeAction>,
): Promise<void> {
  const caller = await requireCaller(
    parts.context,
    call.context.sessionToken,
    call.errors.UNAUTHORIZED,
  );

  const store = requireViewMemory(parts.readMemory, call.errors.MEMORY_NOT_STARTED);

  const action = await buildAction(store);

  const outcome = await writeMemoryChange(parts.context, caller, action).catch((error: unknown) => {
    throw toMomentError(error, call.errors);
  });

  if (outcome === 'unauthorized') {
    throw call.errors.UNAUTHORIZED();
  }

  if (outcome === 'reused') {
    throw call.errors.CLIENT_ACTION_ID_REUSED();
  }
}

type MomentWrite = Awaited<ReturnType<MomentStore['edit']>>;

function throwRefusal(written: MomentWrite): void {
  if (written.status === 'refused') {
    throw new MomentRefusedError(written.reason);
  }
}
