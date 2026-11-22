const encoder = new TextEncoder();

// The bytes a text takes inside a JSON string, which is what a tool result spends on a body.
export function countJSONBytes(text: string): number {
  return encoder.encode(JSON.stringify(text)).length - 2;
}

// Cuts a body into parts whose JSON text fits a budget each: the first part's, then the budget of
// every later part. A cut falls at a paragraph break, then a line break, then a space, and keeps
// the break with the part before it, so the parts join to the body as written.
export function cutBodyParts(
  body: string,
  firstBudgetBytes: number,
  restBudgetBytes: number,
): readonly string[] {
  const parts: string[] = [];
  let rest = body;

  while (rest !== '') {
    const budget = parts.length === 0 ? firstBudgetBytes : restBudgetBytes;

    if (countJSONBytes(rest) <= budget) {
      parts.push(rest);
      break;
    }

    const length = pickPartLength(rest, budget);

    parts.push(rest.slice(0, length));

    rest = rest.slice(length);
  }

  return parts.length === 0 ? [''] : parts;
}

function pickPartLength(text: string, budgetBytes: number): number {
  const fitting = getLongestFit(text, budgetBytes);
  const window = text.slice(0, fitting);

  for (const separator of ['\n\n', '\n', ' ']) {
    const at = window.lastIndexOf(separator);

    if (at > 0) {
      return at + separator.length;
    }
  }

  return fitting;
}

// The longest prefix that fits, never ending inside a surrogate pair, and never empty.
function getLongestFit(text: string, budgetBytes: number): number {
  let low = 1;
  let high = text.length;

  while (low < high) {
    const middle = Math.ceil((low + high) / 2);

    if (countJSONBytes(text.slice(0, middle)) <= budgetBytes) {
      low = middle;
    } else {
      high = middle - 1;
    }
  }

  const last = text.codePointAt(low - 1) ?? 0;
  const isHighSurrogate = last >= 0xd8_00 && last <= 0xdb_ff;

  return isHighSurrogate && low > 1 ? low - 1 : low;
}
