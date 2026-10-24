import { StaleCheckerError } from './stale-checker-error';

const checkerAttempts = 3;

export async function withFreshChecker<Result>(
  run: () => Promise<Result>,
  attemptsLeft = checkerAttempts,
): Promise<Result> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof StaleCheckerError && attemptsLeft > 1) {
      return withFreshChecker(run, attemptsLeft - 1);
    }

    throw error;
  }
}
