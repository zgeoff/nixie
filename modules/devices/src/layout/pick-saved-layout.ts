export type SavedLayoutChoice<Layout> =
  | { readonly status: 'unknown'; readonly names: readonly string[] }
  | { readonly status: 'found'; readonly layout: Layout };

// The saved layout under a name, or a refusal that lists every saved name.
export function pickSavedLayout<Layout extends { readonly name: string }>(
  saved: readonly Layout[],
  name: string,
): SavedLayoutChoice<Layout> {
  const layout = saved.find((candidate) => candidate.name === name);

  if (layout === undefined) {
    return { status: 'unknown', names: saved.map((candidate) => candidate.name) };
  }

  return { status: 'found', layout };
}
