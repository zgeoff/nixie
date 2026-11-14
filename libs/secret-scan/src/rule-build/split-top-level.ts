const openers = '([{';
const closers = ')]}';

// Splits an expression at each top-level occurrence of a separator. A separator inside a string,
// a bracket pair or a comment does not split. A `//` comment runs to the end of its line and is
// removed.
export function splitTopLevel(text: string, separator: string): string[] {
  const parts: string[] = [];
  let current = '';
  let depth = 0;
  let index = 0;

  while (index < text.length) {
    const char = text.charAt(index);

    if (char === '"' || char === "'") {
      const end = getQuoteEnd(text, index, true);

      current += text.slice(index, end);
      index = end;
    } else if (char === '`') {
      const end = getQuoteEnd(text, index, false);

      current += text.slice(index, end);
      index = end;
    } else if (char === '/' && text.charAt(index + 1) === '/') {
      const newline = text.indexOf('\n', index);

      index = newline === -1 ? text.length : newline;
    } else if (depth === 0 && text.startsWith(separator, index)) {
      parts.push(current);

      current = '';
      index += separator.length;
    } else {
      if (openers.includes(char)) {
        depth += 1;
      } else if (closers.includes(char)) {
        depth -= 1;
      }

      current += char;
      index += 1;
    }
  }

  parts.push(current);

  return parts;
}

function getQuoteEnd(text: string, start: number, hasEscapes: boolean): number {
  const quote = text.charAt(start);
  let index = start + 1;

  while (index < text.length) {
    const char = text.charAt(index);

    if (hasEscapes && char === '\\') {
      index += 2;
    } else if (char === quote) {
      return index + 1;
    } else {
      index += 1;
    }
  }

  return text.length;
}
