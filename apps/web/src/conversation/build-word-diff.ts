export interface DiffPart {
  readonly kind: 'same' | 'added' | 'removed';
  readonly text: string;
}

// The most cells the exact diff may fill: its table grows with the product of the 2 token counts,
// so 2 long texts could otherwise freeze the page.
const maxTableCells = 250_000;

export function buildWordDiff(before: string, after: string): readonly DiffPart[] {
  const left = splitTokens(before);
  const right = splitTokens(after);

  if (left.length * right.length <= maxTableCells) {
    return buildExactParts(left, right);
  }

  const prefixLength = countSharedPrefix(left, right);
  const suffixLength = countSharedSuffix(left, right, prefixLength);
  const leftMiddle = left.slice(prefixLength, left.length - suffixLength);
  const rightMiddle = right.slice(prefixLength, right.length - suffixLength);

  const middle =
    leftMiddle.length * rightMiddle.length <= maxTableCells
      ? buildExactParts(leftMiddle, rightMiddle)
      : buildReplacedParts(leftMiddle, rightMiddle);

  return mergeParts([
    ...buildSameParts(left.slice(0, prefixLength)),
    ...middle,
    ...buildSameParts(left.slice(left.length - suffixLength)),
  ]);
}

function splitTokens(text: string): readonly string[] {
  return text.split(/(?<space>\s+)/u).filter((token) => token !== '');
}

function buildExactParts(left: readonly string[], right: readonly string[]): readonly DiffPart[] {
  return mergeParts(collectParts(left, right, buildCommonLengths(left, right)));
}

function mergeParts(parts: readonly DiffPart[]): readonly DiffPart[] {
  return parts.reduce<DiffPart[]>((merged, part) => {
    const last = merged.at(-1);

    if (last?.kind === part.kind) {
      merged[merged.length - 1] = { kind: part.kind, text: last.text + part.text };
    } else {
      merged.push(part);
    }

    return merged;
  }, []);
}

function collectParts(
  left: readonly string[],
  right: readonly string[],
  lengths: readonly (readonly number[])[],
): DiffPart[] {
  const parts: DiffPart[] = [];
  let row = 0;
  let column = 0;

  while (row < left.length || column < right.length) {
    const next = pickNextPart({ left, right, lengths, row, column });

    parts.push(next.part);

    row = next.row;
    column = next.column;
  }

  return parts;
}

interface DiffCursor {
  readonly left: readonly string[];
  readonly right: readonly string[];
  readonly lengths: readonly (readonly number[])[];
  readonly row: number;
  readonly column: number;
}

interface NextPart {
  readonly part: DiffPart;
  readonly row: number;
  readonly column: number;
}

function pickNextPart(cursor: DiffCursor): NextPart {
  const row = cursor.row;
  const column = cursor.column;
  const leftToken = cursor.left[row];
  const rightToken = cursor.right[column];

  if (leftToken !== undefined && leftToken === rightToken) {
    return { part: { kind: 'same', text: leftToken }, row: row + 1, column: column + 1 };
  }

  const keepsMoreByRemoving =
    (cursor.lengths[row + 1]?.[column] ?? 0) >= (cursor.lengths[row]?.[column + 1] ?? 0);

  if (leftToken !== undefined && (rightToken === undefined || keepsMoreByRemoving)) {
    return { part: { kind: 'removed', text: leftToken }, row: row + 1, column };
  }

  return { part: { kind: 'added', text: rightToken ?? '' }, row, column: column + 1 };
}

function buildCommonLengths(left: readonly string[], right: readonly string[]): number[][] {
  const lengths = Array.from({ length: left.length + 1 }, () =>
    Array.from({ length: right.length + 1 }, () => 0),
  );

  for (let row = left.length - 1; row >= 0; row -= 1) {
    for (let column = right.length - 1; column >= 0; column -= 1) {
      const current = lengths[row] ?? [];

      current[column] =
        left[row] === right[column]
          ? (lengths[row + 1]?.[column + 1] ?? 0) + 1
          : Math.max(lengths[row + 1]?.[column] ?? 0, current[column + 1] ?? 0);
    }
  }

  return lengths;
}

function countSharedPrefix(left: readonly string[], right: readonly string[]): number {
  let count = 0;

  while (count < left.length && count < right.length && left[count] === right[count]) {
    count += 1;
  }

  return count;
}

function countSharedSuffix(
  left: readonly string[],
  right: readonly string[],
  prefixLength: number,
): number {
  let count = 0;

  while (
    count < left.length - prefixLength &&
    count < right.length - prefixLength &&
    left[left.length - 1 - count] === right[right.length - 1 - count]
  ) {
    count += 1;
  }

  return count;
}

// The linear fallback for a middle too long to compare: all of it removed, then all of it added.
function buildReplacedParts(left: readonly string[], right: readonly string[]): DiffPart[] {
  return [
    { kind: 'removed', text: left.join('') },
    { kind: 'added', text: right.join('') },
  ];
}

function buildSameParts(tokens: readonly string[]): DiffPart[] {
  return tokens.length === 0 ? [] : [{ kind: 'same', text: tokens.join('') }];
}
