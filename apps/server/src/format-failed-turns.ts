// The reason the conversation's turns are failing: how many failed in a row.
export function formatFailedTurns(errors: number): string {
  return `the last ${String(errors)} turns failed`;
}
