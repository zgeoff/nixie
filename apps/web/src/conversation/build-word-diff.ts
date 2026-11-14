export interface DiffPart {
  readonly kind: 'same' | 'added' | 'removed';
  readonly text: string;
}

export function buildWordDiff(before: string, after: string): readonly DiffPart[] {
  const left = splitTokens(before);
  const right = splitTokens(after);
  const lengths = buildCommonLengths(left, right);

  return mergeParts(collectParts(left, right, lengths));
}

function splitTokens(text: string): readonly string[] {
  return text.split(/(?<space>\s+)/u).filter((token) => token !== '');
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
