import { readRatingNotes, readVersionTexts } from '@heynixie/memory';
import type { APIContext } from '../types';
import { apiImplementer } from '../utils/api-implementer';
import { requireCaller } from './require-caller';

export function createMemoryProcedures(context: APIContext) {
  return {
    readVersions: apiImplementer.memory.readVersions.handler(async (options) => {
      await requireCaller(context, options.context.sessionToken, options.errors.UNAUTHORIZED);

      const versions = await readVersionTexts(context.log, options.input.versions);

      return { versions: [...versions] };
    }),

    readRatingNotes: apiImplementer.memory.readRatingNotes.handler(async (options) => {
      await requireCaller(context, options.context.sessionToken, options.errors.UNAUTHORIZED);

      const notes = await readRatingNotes(context.log, options.input.notes);

      return { notes: [...notes] };
    }),

    writerStatus: apiImplementer.memory.writerStatus.handler(async (options) => {
      await requireCaller(context, options.context.sessionToken, options.errors.UNAUTHORIZED);

      return {
        isEnabled: false,
        backlog: 0,
        batches: 0,
        cursor: 0,
        failures: 0,
        isCatchingUp: false,
        lastError: null,
        retryAt: null,
      };
    }),

    consolidatorStatus: apiImplementer.memory.consolidatorStatus.handler(async (options) => {
      await requireCaller(context, options.context.sessionToken, options.errors.UNAUTHORIZED);

      return { isEnabled: false };
    }),
  };
}
