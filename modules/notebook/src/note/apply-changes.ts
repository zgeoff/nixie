export interface BodyChange {
  readonly find: string;
  readonly replace: string;
  readonly all?: boolean | undefined;
}

export type ChangeResult =
  | { readonly kind: 'applied'; readonly body: string }
  | { readonly kind: 'no_match'; readonly index: number }
  | { readonly kind: 'many_matches'; readonly index: number; readonly count: number };

// Applies each change to the result of the one before. A change with `all` replaces every match;
// any other change needs exactly one. No change applies when one fails.
export function applyChanges(body: string, changes: readonly BodyChange[]): ChangeResult {
  let current = body;

  for (const [index, change] of changes.entries()) {
    const count = countMatches(current, change.find);

    if (count === 0) {
      return { kind: 'no_match', index };
    }

    if (count > 1 && change.all !== true) {
      return { kind: 'many_matches', index, count };
    }

    current = current.split(change.find).join(change.replace);
  }

  return { kind: 'applied', body: current };
}

function countMatches(text: string, find: string): number {
  return find === '' ? 0 : text.split(find).length - 1;
}
