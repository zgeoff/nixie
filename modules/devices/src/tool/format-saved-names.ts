// The sentence that lists the saved names, for a refusal that names an unknown one.
export function formatSavedNames(names: readonly string[]): string {
  return names.length === 0
    ? 'It has no saved layouts.'
    : `The saved layouts are ${names.join(', ')}.`;
}
