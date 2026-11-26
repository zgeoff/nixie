// Identifiers that the platform defines, which say nothing about a feature
const platformIdentifiers: ReadonlySet<string> = new Set([
  'codePoint',
  'codePointAt',
  'fromCodePoint',
  'searchParams',
]);

// Names that are ordinary English words, or a term of nixie's glossary. An identifier that is one
// of them alone, such as the `code` of an error or the `imp` of a sandbox, says nothing about a
// feature, so only a longer identifier or a string counts.
const plainWordNames: ReadonlySet<string> = new Set([
  'code',
  'coding',
  'computer',
  'devices',
  'images',
  'imp',
  'mail',
  'search',
  'spend',
  'voice',
]);

// The rule is in `namesRule` of collect-name-faults, and the tests of this file hold each case.
export function collectNameHits(source: string, names: readonly string[]): string[] {
  const found = new Set<string>();

  for (const token of scanTokens(source)) {
    if (token.kind === 'text') {
      found.add(toComparable(token.value));
    } else if (!platformIdentifiers.has(token.value)) {
      for (const candidate of collectLeadingNames(token.value)) {
        found.add(candidate);
      }

      if (!plainWordNames.has(toComparable(token.value))) {
        found.add(toComparable(token.value));
      }
    }
  }

  return names.filter((name) => found.has(toComparable(name)));
}

interface Token {
  kind: 'word' | 'text';
  value: string;
}

const wordStart = /[A-Za-z_$]/u;
const wordPart = /[\w$]/u;

const keywordsBeforeRegex: ReadonlySet<string> = new Set([
  'return',
  'typeof',
  'case',
  'in',
  'of',
  'void',
  'delete',
  'throw',
  'yield',
  'await',
]);

// Words and the text of string and template literals, in source order. Comments, regex literal
// bodies, JSX text and the string operand of `in` or an indexed access are left out, and the code
// inside a template substitution is scanned like any other code.
function* scanTokens(source: string): Generator<Token> {
  // Each open `${` records the brace depth at which its substitution ends.
  const substitutions: number[] = [];
  let depth = 0;
  let previous = '';
  let index = 0;

  while (index < source.length) {
    const char = source[index] ?? '';
    const next = source[index + 1] ?? '';

    if (char === '/' && next === '/') {
      index = skipTo(source, index, '\n');
    } else if (char === '/' && next === '*') {
      index = skipPast(source, index + 2, '*/');
    } else if (char === '/' && isRegexStart(previous)) {
      index = skipRegex(source, index);
      previous = ')';
    } else if (char === '"' || char === "'") {
      const end = skipString(source, index, char);
      const text = source.slice(index + 1, end - 1);

      if (!isPropertyName(source, index, end)) {
        yield { kind: 'text', value: text };
      }

      index = end;
      previous = ')';
    } else if (char === '`') {
      const part = readTemplatePart(source, index + 1);

      yield { kind: 'text', value: part.text };
      index = part.end;

      if (part.opensSubstitution) {
        substitutions.push(depth);

        depth += 1;
        previous = '{';
      } else {
        previous = ')';
      }
    } else if (char === '{') {
      depth += 1;
      previous = char;
      index += 1;
    } else if (char === '}') {
      depth -= 1;
      index += 1;

      if (substitutions.at(-1) === depth) {
        substitutions.pop();

        const part = readTemplatePart(source, index);

        yield { kind: 'text', value: part.text };
        index = part.end;

        if (part.opensSubstitution) {
          substitutions.push(depth);

          depth += 1;
          previous = '{';
        } else {
          previous = ')';
        }
      } else {
        previous = char;
      }
    } else if (char === '>' && isJsxTagEnd(source, index) && !isSelfClosing(source, index)) {
      index = skipJsxText(source, index + 1);
      previous = '>';
    } else if (wordStart.test(char)) {
      let end = index + 1;

      while (end < source.length && wordPart.test(source[end] ?? '')) {
        end += 1;
      }

      const value = source.slice(index, end);

      yield { kind: 'word', value };
      index = end;
      previous = keywordsBeforeRegex.has(value) ? '{' : 'a';
    } else {
      if (!/\s/u.test(char)) {
        previous = /\d/u.test(char) ? 'a' : char;
      }

      index += 1;
    }
  }
}

function skipTo(source: string, from: number, stop: string): number {
  const at = source.indexOf(stop, from);

  return at === -1 ? source.length : at;
}

function skipPast(source: string, from: number, stop: string): number {
  const at = source.indexOf(stop, from);

  return at === -1 ? source.length : at + stop.length;
}

// A `/` after a value is division. After anything else it opens a regex literal.
function isRegexStart(previous: string): boolean {
  return !(previous === 'a' || previous === ')' || previous === ']');
}

function skipRegex(source: string, from: number): number {
  let index = from + 1;
  let inClass = false;

  while (index < source.length && (inClass || source[index] !== '/') && source[index] !== '\n') {
    if (source[index] === '\\') {
      index += 1;
    } else if (source[index] === '[') {
      inClass = true;
    } else if (source[index] === ']') {
      inClass = false;
    }

    index += 1;
  }

  index += 1;

  while (index < source.length && wordPart.test(source[index] ?? '')) {
    index += 1;
  }

  return index;
}

function skipString(source: string, from: number, quote: string): number {
  let index = from + 1;

  while (index < source.length && source[index] !== quote && source[index] !== '\n') {
    index += source[index] === '\\' ? 2 : 1;
  }

  return Math.min(index + 1, source.length);
}

// A string that names a property, as the operand of `in` or the key of an indexed access, holds a
// word of the data it describes and never a feature.
function isPropertyName(source: string, start: number, end: number): boolean {
  const after = source.slice(end);
  const before = source.slice(0, start);

  return /^\s+in\s/u.test(after) || (after.startsWith(']') && /[\w\])]\[$/u.test(before));
}

// Reads template text from `from` up to the closing backtick or the next `${`.
function readTemplatePart(
  source: string,
  from: number,
): { text: string; end: number; opensSubstitution: boolean } {
  let index = from;

  while (index < source.length && source[index] !== '`') {
    if (source[index] === '$' && source[index + 1] === '{') {
      return { text: source.slice(from, index), end: index + 2, opensSubstitution: true };
    }

    index += source[index] === '\\' ? 2 : 1;
  }

  return { text: source.slice(from, index), end: index + 1, opensSubstitution: false };
}

// The `>` that ends a JSX opening tag: the nearest `<` before it on the line starts a tag with a
// name, and the `>` is no arrow and no comparison.
function isJsxTagEnd(source: string, index: number): boolean {
  if (source[index - 1] === '=') {
    return false;
  }

  const line = source.slice(source.lastIndexOf('\n', index) + 1, index);

  return /(?:^|[(\s=?:&|,{])<[A-Za-z][\w.:-]*(?:\s[^<>]*)?$/u.test(line);
}

function isSelfClosing(source: string, index: number): boolean {
  return source[index - 1] === '/';
}

// JSX text runs to the next `<` or `{`.
function skipJsxText(source: string, from: number): number {
  let index = from;

  while (index < source.length && source[index] !== '<' && source[index] !== '{') {
    index += 1;
  }

  return index;
}

function toComparable(text: string): string {
  return text.toLowerCase().replaceAll(/[_-]/gu, '');
}

// The names that a compound identifier holds: each run of its leading words. A one-word
// identifier holds none.
function collectLeadingNames(identifier: string): string[] {
  const words = splitWords(identifier);
  const names: string[] = [];

  for (let count = 1; count < words.length; count += 1) {
    names.push(toComparable(words.slice(0, count).join('')));
  }

  return names;
}

function splitWords(identifier: string): string[] {
  return identifier
    .replaceAll(/(?<before>[a-z0-9])(?<after>[A-Z])/gu, '$<before> $<after>')
    .replaceAll(/(?<before>[A-Z]+)(?<after>[A-Z][a-z])/gu, '$<before> $<after>')
    .split(/[\s_$]+/u)
    .filter((word) => word !== '');
}
