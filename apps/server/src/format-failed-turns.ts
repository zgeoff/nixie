export function formatFailedTurns(errors: number): string {
  return errors === 1 ? 'the last turn failed' : `the last ${String(errors)} turns failed`;
}
