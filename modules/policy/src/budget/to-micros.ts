// Money in the ledger is whole millionths of a dollar. A dollar amount from a file or a tool
// argument converts here, once.
export function toMicros(dollars: number): number {
  return Math.round(dollars * 1_000_000);
}
