import type { DefinitionsContext } from '@heynixie/definitions';
import { writeDefinitionResolution } from '@heynixie/definitions';
import { hostImplementer } from './host-implementer';

export function createHostDefinitionProcedures(readDefinitions: () => DefinitionsContext | null) {
  const definitions = hostImplementer.definitions;

  return {
    resolve: definitions.resolve.handler(async (options) => {
      const context = readDefinitions();
      const buildNotStarted = options.errors.DEFINITIONS_NOT_STARTED;

      if (context === null) {
        throw buildNotStarted();
      }

      const resolved = await writeDefinitionResolution(context, options.input);

      if (resolved.status === 'refused') {
        const buildNotFound = options.errors.NOT_FOUND;

        throw buildNotFound({ message: resolved.reason });
      }

      return {
        definitionID: options.input.definitionID,
        changeID: resolved.changeID,
        keep: options.input.keep,
      };
    }),
  };
}
