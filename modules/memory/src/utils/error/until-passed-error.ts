export class UntilPassedError extends Error {
  override readonly name = 'UntilPassedError';

  readonly code = 'UNTIL_PASSED';

  constructor(until: number, now: number) {
    super(
      `the end time ${new Date(until).toISOString()} has passed; it is now ${new Date(now).toISOString()}`,
    );
  }
}
