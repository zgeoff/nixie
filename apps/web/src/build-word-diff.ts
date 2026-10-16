// One run of a word diff: text both versions hold, text the later version added, or text it removed.
export interface DiffPart {
  readonly kind: 'same' | 'added' | 'removed';
  readonly text: string;
}

// Diffs two texts word by word, keeping the spaces between words, so a reader sees what an edit
// changed in an item. It takes the longest run of words both texts share and marks the rest as
// removed from the earlier text or added in the later one, removals first.
export function buildWordDiff(before: string, after: string): readonly DiffPart[] {
  const left = splitTokens(before);
  const right = splitTokens(after);
  const lengths = buildCommonLengths(left, right);

  return mergeParts(collectParts(left, right, lengths));
}

function splitTokens(text: string): readonly string[] {
  return text.split(/(?<space>\s+)/u).filter((token) => token !== '');
}

// lengths[row][column] holds the longest common run of tokens from left[row] and right[column] on
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

// walks both texts from their starts, one part per step, until both are spent
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

// joins neighbouring parts of one kind, so a changed phrase reads as one run
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
