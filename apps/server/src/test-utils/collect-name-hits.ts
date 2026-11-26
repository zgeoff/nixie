const tokenPattern =
  /\/\*[\s\S]*?\*\/|\/\/[^\n]*|(?<quote>['"`])(?<text>(?:\\.|(?!\k<quote>)[^\\])*)\k<quote>|[A-Za-z_$][\w$]*/gu;

// The rule is in `namesRule` of collect-name-faults, and the tests of this file hold each case.
export function collectNameHits(source: string, names: readonly string[]): string[] {
  const found = new Set<string>();

  for (const match of source.matchAll(tokenPattern)) {
    const text = match.groups?.['text'];

    if (text !== undefined) {
      found.add(toComparable(text));
    } else if (!match[0].startsWith('/')) {
      const words = splitWords(match[0]);

      if (words.length > 1) {
        found.add(toComparable(words[0] ?? ''));
      }
    }
  }

  return names.filter((name) => found.has(toComparable(name)));
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
