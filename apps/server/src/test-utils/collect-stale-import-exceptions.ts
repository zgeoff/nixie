import type { ImportException } from '../types';
import type { ImportLeak } from './types';

// One fault per import exception that matches no dependency.
export function collectStaleImportExceptions(
  leaks: readonly ImportLeak[],
  exceptions: readonly ImportException[],
): string[] {
  return exceptions.flatMap((exception) =>
    exception.imports
      .filter(
        (name) =>
          !leaks.some((leak) => leak.directory === exception.where && leak.importName === name),
      )
      .map((name) => `the exception for ${name} in ${exception.where} matches nothing. Delete it.`),
  );
}
