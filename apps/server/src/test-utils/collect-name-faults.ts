import type { NameException } from '../types';
import { isInside } from './is-inside';
import type { NameLeak } from './types';

const namesRule =
  'A name is found in a string literal, or in the text of a template literal, that equals a feature ID or the system of an adapter, ignoring case, `_` and `-`. It is found in an identifier that equals the name alone, unless the name is an ordinary English word or a glossary term, such as `code` or `imp`, and in an identifier of 2 or more words whose leading words are the name, such as `googleToken`, even inside a template substitution. A name in a later word, such as `readGoogle`, is not found. A string that is the operand of `in` or the key of an indexed access, the platform identifiers `codePoint`, `codePointAt`, `fromCodePoint` and `searchParams`, the body of a regex literal and the text of a JSX element are not hits. Comments, prose, test files and test utilities are not read.';

// One fault per name that no exception covers. Each says what to do: move the code into the
// feature's package, or fill a core list from the composition root.
export function collectNameFaults(
  leaks: readonly NameLeak[],
  exceptions: readonly NameException[],
): string[] {
  return leaks
    .filter(
      (leak) =>
        !exceptions.some(
          (exception) =>
            exception.names.includes(leak.name) && isInside(leak.file, exception.where),
        ),
    )
    .map(
      (leak) =>
        `${leak.file} names ${leak.name}, and a core module may not name a feature or an outside service. Move the code into the feature's package, or fill a core list from the composition root. (${namesRule})`,
    );
}
