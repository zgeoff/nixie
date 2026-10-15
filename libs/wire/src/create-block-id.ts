// Creates the fresh random ID that a block's opening and closing tags both carry, so text inside the
// block cannot close it early: 12 hex characters, which text written before the block cannot guess.
export function createBlockID(): string {
  return crypto.randomUUID().replaceAll('-', '').slice(0, 12);
}
