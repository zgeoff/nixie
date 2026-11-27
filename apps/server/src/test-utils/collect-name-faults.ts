import type { NameException, OwnedPaths } from '../types';
import { isInside } from './is-inside';
import type { NameLeak } from './types';

const namesRule =
  'The TypeScript compiler parses each file, and the check reads the identifiers and the string and template literals of its syntax tree. A name is found in a string literal, or in the text of a template literal, that equals a feature ID or the system of an adapter, ignoring case, `_` and `-`. It is found in an identifier that equals the name alone, unless the name is an ordinary English word or a glossary term, such as `code` or `imp`, and in an identifier of 2 or more words whose leading words are the name, such as `googleToken`, even inside a template substitution. A name in a later word, such as `readGoogle`, is not found. A string that is the operand of `in` or the key of an indexed access, the platform identifiers `codePoint`, `codePointAt`, `fromCodePoint` and `searchParams`, regex literals and JSX text are not hits. Comments, test files and test utilities are not read.';

const ownedRule =
  "A feature's own code may hold the feature's name. List the path of that code under the feature's ID in `owned` of leak-exceptions.ts, and the name is no leak inside it. A path is owned by one feature and covers only that feature's name.";

// One fault per name that no exception covers and that no owned path of its feature covers. Each
// says what to do: move the code into the feature's package, fill a core list from the composition
// root, or mark the path as the feature's own.
export function collectNameFaults(
  leaks: readonly NameLeak[],
  exceptions: readonly NameException[],
  owned: OwnedPaths = {},
): string[] {
  return leaks
    .filter(
      (leak) =>
        !exceptions.some(
          (exception) =>
            exception.names.includes(leak.name) && isInside(leak.file, exception.where),
        ) && !isOwned(leak, owned),
    )
    .map(
      (leak) =>
        `${leak.file} names ${leak.name}, and a core module may not name a feature or an outside service. Move the code into the feature's package, or fill a core list from the composition root. (${namesRule} ${ownedRule})`,
    );
}

function isOwned(leak: NameLeak, owned: OwnedPaths): boolean {
  const paths: readonly string[] =
    Object.entries(owned).find(([feature]) => feature === leak.name)?.[1] ?? [];

  return paths.some((path) => isInside(leak.file, path));
}
