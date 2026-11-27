// Whether 2 lists name the same addresses, in any order and with repeats ignored.
export function isSameAddresses(left: readonly string[], right: readonly string[]): boolean {
  const sortedLeft = [...new Set(left)].toSorted();
  const sortedRight = [...new Set(right)].toSorted();

  return JSON.stringify(sortedLeft) === JSON.stringify(sortedRight);
}
