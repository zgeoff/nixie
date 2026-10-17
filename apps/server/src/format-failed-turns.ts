// The reason the conversation's turns are failing: how many failed in a row.
export function formatFailedTurns(errors: number): string {
  return errors === 1 ? 'the last turn failed' : `the last ${String(errors)} turns failed`;
}
