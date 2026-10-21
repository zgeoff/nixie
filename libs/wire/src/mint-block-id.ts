// The ID is random so that text written before the block cannot guess it and close the block
// early.
export function mintBlockID(): string {
  return crypto.randomUUID().replaceAll('-', '').slice(0, 12);
}
