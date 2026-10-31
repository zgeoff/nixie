// Each removal runs even when another fails, so a failed imp removal never leaves the model secret
// stored in impd.
export async function removeEachResource(
  removals: readonly (() => Promise<unknown>)[],
): Promise<void> {
  const settled = await Promise.allSettled(removals.map((remove) => remove()));
  const failures = settled.flatMap((removal) =>
    removal.status === 'rejected' ? [String(removal.reason)] : [],
  );

  if (failures.length > 0) {
    throw new Error(`cleanup left resources in impd:\n${failures.join('\n')}`);
  }
}
