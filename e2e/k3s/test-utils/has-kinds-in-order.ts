// Tells whether the records hold each kind in the given order, with any other records between
// them, such as a model reply before a tool call or a turn's usage record.
export function hasKindsInOrder(
  records: readonly { readonly kind: string }[],
  kinds: readonly string[],
): boolean {
  const matched = records.reduce(
    (count, record) => (record.kind === kinds[count] ? count + 1 : count),
    0,
  );

  return matched === kinds.length;
}
