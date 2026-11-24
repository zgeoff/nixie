// Every erasure ID of a tree, each one after all the erasures it reached, so a parent finishes after
// every child that it holds, whichever erasure started that child. A child that two parents reached,
// or that reaches its own parent, still appears once.
export function collectFinishOrder(
  erasureIDs: readonly string[],
  reached: ReadonlyMap<string, ReadonlySet<string>>,
): readonly string[] {
  const order: string[] = [];

  const visited = new Set<string>();

  const visit = (erasureID: string): void => {
    if (visited.has(erasureID)) {
      return;
    }

    visited.add(erasureID);

    for (const childID of reached.get(erasureID) ?? []) {
      visit(childID);
    }

    order.push(erasureID);
  };

  for (const erasureID of erasureIDs) {
    visit(erasureID);
  }

  return order.filter((erasureID) => erasureIDs.includes(erasureID));
}
