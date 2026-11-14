export class StaleCheckerError extends Error {
  override readonly name = 'StaleCheckerError';

  readonly code = 'STALE_CHECKER';

  constructor(checked: string, inForce: string) {
    super(`the checker ran under definitions ${checked}, and ${inForce} is in force`);
  }
}
