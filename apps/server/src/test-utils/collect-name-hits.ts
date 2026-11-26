// Identifiers that the platform defines, which say nothing about a feature
const platformIdentifiers: ReadonlySet<string> = new Set([
  'codePoint',
  'codePointAt',
  'fromCodePoint',
  'searchParams',
]);

const tokenPattern =
  /\/\*[\s\S]*?\*\/|\/\/[^\n]*|(?<quote>['"`])(?<text>(?:\\.|(?!\k<quote>)[^\\])*)\k<quote>|[A-Za-z_$][\w$]*/gu;

// The rule is in `namesRule` of collect-name-faults, and the tests of this file hold each case.
export function collectNameHits(source: string, names: readonly string[]): string[] {
  const found = new Set<string>();

  for (const match of source.matchAll(tokenPattern)) {
    const text = match.groups?.['text'];

    if (text !== undefined) {
      if (!isPropertyName(source, match.index, match[0].length)) {
        found.add(toComparable(text));
      }
    } else if (!match[0].startsWith('/')) {
      const words = splitWords(match[0]);

      if (words.length > 1 && !platformIdentifiers.has(match[0])) {
        found.add(toComparable(words[0] ?? ''));
      }
    }
  }

  return names.filter((name) => found.has(toComparable(name)));
}

// A string that names a property, as the operand of `in` or the key of an indexed access, holds a
// word of the data it describes and never a feature.
function isPropertyName(source: string, index: number, length: number): boolean {
  const after = source.slice(index + length);
  const before = source.slice(0, index);

  return /^\s+in\s/u.test(after) || (after.startsWith(']') && /[\w\])]\[$/u.test(before));
}

function toComparable(text: string): string {
  return text.toLowerCase().replaceAll(/[_-]/gu, '');
}

function splitWords(identifier: string): string[] {
  return identifier
    .replaceAll(/(?<before>[a-z0-9])(?<after>[A-Z])/gu, '$<before> $<after>')
    .replaceAll(/(?<before>[A-Z]+)(?<after>[A-Z][a-z])/gu, '$<before> $<after>')
    .split(/[\s_$]+/u)
    .filter((word) => word !== '');
}
