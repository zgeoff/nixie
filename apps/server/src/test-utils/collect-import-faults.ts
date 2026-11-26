import type { ImportException } from '../types';
import type { ImportLeak } from './types';

// One fault per feature module that a core module depends on with no exception.
export function collectImportFaults(
  leaks: readonly ImportLeak[],
  exceptions: readonly ImportException[],
): string[] {
  return leaks
    .filter(
      (leak) =>
        !exceptions.some(
          (exception) =>
            exception.where === leak.directory && exception.imports.includes(leak.importName),
        ),
    )
    .map(
      (leak) =>
        `${leak.directory} depends on ${leak.importName}, and a core module may not depend on a feature module. Move the code into the feature's package, or fill a core list from the composition root.`,
    );
}
