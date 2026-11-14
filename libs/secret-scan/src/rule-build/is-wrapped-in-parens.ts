// True when one pair of parentheses encloses the whole text, as in `(a || b)` but not in
// `(a) || (b)`. Strings and comments are not special here, so the caller strips comments first and
// the text holds no unbalanced bracket inside a string.
export function isWrappedInParens(text: string): boolean {
  if (!text.startsWith('(') || !text.endsWith(')')) {
    return false;
  }

  let depth = 0;
  let quote = '';

  for (let index = 0; index < text.length; index += 1) {
    const char = text.charAt(index);

    if (quote !== '') {
      if (char === '\\' && quote !== '`') {
        index += 1;
      } else if (char === quote) {
        quote = '';
      }
    } else if (char === '"' || char === "'" || char === '`') {
      quote = char;
    } else if (char === '(') {
      depth += 1;
    } else if (char === ')') {
      depth -= 1;

      if (depth === 0 && index < text.length - 1) {
        return false;
      }
    }
  }

  return depth === 0;
}
