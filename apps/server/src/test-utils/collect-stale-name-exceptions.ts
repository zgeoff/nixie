import type { NameException } from '../types';
import { isInside } from './is-inside';
import type { NameLeak } from './types';

// One fault per name exception that matches no name in the code.
export function collectStaleNameExceptions(
  leaks: readonly NameLeak[],
  exceptions: readonly NameException[],
): string[] {
  return exceptions.flatMap((exception) =>
    exception.names
      .filter(
        (name) => !leaks.some((leak) => leak.name === name && isInside(leak.file, exception.where)),
      )
      .map((name) => `the exception for ${name} in ${exception.where} matches nothing. Delete it.`),
  );
}
