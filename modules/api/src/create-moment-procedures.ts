// oxlint-disable new-cap -- oRPC names a procedure's typed errors by their upper-case codes
import { match } from 'ts-pattern';
import { apiImplementer } from './api-implementer';
import { MomentRefusedError } from './moment-refused-error';
import { requireCaller } from './require-caller';
import { requireViewMemory } from './require-view-memory';
import { toMomentError } from './to-moment-error';
import type { APIContext, ReadViewMemory } from './types';
import { writeMemoryChange } from './write-memory-change';

export function createMomentProcedures(context: APIContext, readMemory: ReadViewMemory) {
  const memory = apiImplementer.memory;

  return {
    previewMomentDestroy: memory.previewMomentDestroy.handler(async (options) => {
      await requireCaller(context, options.context.sessionToken, options.errors.UNAUTHORIZED);

      const store = requireViewMemory(readMemory, options.errors.MEMORY_NOT_STARTED);

      const read = await store.moments.readDestroyPreview(options.input);

      if (read.status === 'refused') {
        throw toMomentError(new MomentRefusedError(read.reason), options.errors);
      }

      const preview = read.preview;

      return {
        ...preview,
        keptAt: new Date(preview.keptAt),
        reflections: preview.reflections.map((reflection) => ({
          model: reflection.model,
          text: reflection.text,
          writtenAt: new Date(reflection.writtenAt),
        })),
      };
    }),

    destroyMoment: memory.destroyMoment.handler(async (options) => {
      const caller = await requireCaller(
        context,
        options.context.sessionToken,
        options.errors.UNAUTHORIZED,
      );

      const store = requireViewMemory(readMemory, options.errors.MEMORY_NOT_STARTED);
      const target = { momentID: options.input.momentID, version: options.input.version };
      const result = { momentID: target.momentID };

      const outcome = await writeMemoryChange(context, caller, {
        clientActionID: options.input.clientActionID,
        procedure: 'memory.destroyMoment',
        input: target,
        result,
        apply: async (writeInTransaction) => {
          const destroyed = await store.moments.destroy(target, writeInTransaction);

          if (destroyed.status === 'refused') {
            throw new MomentRefusedError(destroyed.reason);
          }
        },
      }).catch((error: unknown) => {
        throw toMomentError(error, options.errors);
      });

      await match(outcome)
        .with('unauthorized', () => {
          throw options.errors.UNAUTHORIZED();
        })
        .with('reused', () => {
          throw options.errors.CLIENT_ACTION_ID_REUSED();
        })
        .with('applied', () => store.moments.finishDestroy(target.momentID))
        .exhaustive();

      return result;
    }),
  };
}
