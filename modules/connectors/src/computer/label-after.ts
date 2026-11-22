// Settles with the label once the promise settles, so a race can say which one came first.
export async function labelAfter<Label extends string>(
  waiting: Promise<unknown>,
  label: Label,
): Promise<Label> {
  await waiting;

  return label;
}
