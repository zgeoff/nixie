// oxlint-disable new-cap -- oRPC names a procedure's typed errors by their upper-case codes
import type { DefinitionsContext } from '@heynixie/definitions';
import { match } from 'ts-pattern';
import { requireCaller } from '../memory/require-caller';
import type { APIContext } from '../types';
import { apiImplementer } from '../utils/api-implementer';
import { runDefinitionUndo } from './run-definition-undo';

export function createDefinitionProcedures(
  context: APIContext,
  readDefinitions: () => DefinitionsContext | null,
) {
  const definitions = apiImplementer.definitions;

  return {
    undo: definitions.undo.handler(async (options) => {
      const caller = await requireCaller(
        context,
        options.context.sessionToken,
        options.errors.UNAUTHORIZED,
      );

      const started = readDefinitions();

      if (started === null) {
        throw options.errors.NOT_STARTED();
      }

      const run = await runDefinitionUndo(context, started, caller, options.input);

      if (run.status === 'unauthorized') {
        throw options.errors.UNAUTHORIZED();
      }

      if (run.status === 'reused') {
        throw options.errors.CLIENT_ACTION_ID_REUSED();
      }

      if (run.status === 'done') {
        return run.undone;
      }

      const errors = options.errors;

      // an undo refuses nothing but these; the other codes belong to a define
      throw match(run.refusal)
        .with({ code: 'REPLACED' }, (refusal) => errors.REPLACED({ data: { head: refusal.head } }))
        .with({ code: 'REPO_MOVED' }, (refusal) =>
          errors.REPO_MOVED({ data: { seedSequence: refusal.seedSequence } }),
        )
        .with({ code: 'NOT_IN_FORCE' }, (refusal) =>
          errors.NOT_IN_FORCE({ data: { cause: refusal.cause } }),
        )
        .with({ code: 'ONE_SHOT_OVER_REPO' }, () => errors.ONE_SHOT_OVER_REPO())
        .with({ code: 'ONE_SHOT_PAST' }, () => errors.ONE_SHOT_PAST())
        .otherwise(() => errors.NOT_FOUND());
    }),
  };
}
