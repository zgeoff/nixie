export function buildPurgeKey(recordSequence: number, itemID: string): string {
  return `${String(recordSequence)}/${itemID}`;
}
