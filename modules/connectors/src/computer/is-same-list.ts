// Two calls with the same input share a key, so the binding found must be for the host that the
// policy allowed.
export function isSameList(first: readonly string[], second: readonly string[]): boolean {
  return first.length === second.length && first.every((item, index) => item === second[index]);
}
