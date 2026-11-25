export type LayoutRemoval =
  | { readonly removed: true; readonly names: readonly string[] }
  | { readonly removed: false; readonly names: readonly string[] };

// Whether a name is saved, and the saved names that stay after the removal.
export function pickLayoutRemoval(names: readonly string[], name: string): LayoutRemoval {
  if (!names.includes(name)) {
    return { removed: false, names };
  }

  return { removed: true, names: names.filter((candidate) => candidate !== name) };
}
