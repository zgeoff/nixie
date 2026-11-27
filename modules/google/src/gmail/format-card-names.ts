// The names of a card line, or `none` when it has none.
export function formatCardNames(value: unknown): string {
  const names = Array.isArray(value)
    ? value.filter((name): name is string => typeof name === 'string')
    : [];

  return names.length === 0 ? 'none' : names.join(', ');
}
