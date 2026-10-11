export interface WaitForConditionOptions {
  readonly timeoutMs?: number;
  readonly intervalMs?: number;
}

// Polls check on the real clock until it returns true, and throws when the timeout passes first.
// Work behind a test clock still runs real database I/O, so a test waits on the state it expects.
export async function waitForCondition(
  check: () => boolean | Promise<boolean>,
  options: WaitForConditionOptions = {},
): Promise<void> {
  const deadline = Date.now() + (options.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  // oxlint-disable-next-line no-await-in-loop -- each check waits for the one before it
  while (!(await check())) {
    if (Date.now() >= deadline) {
      throw new Error(`condition not met within ${options.timeoutMs ?? DEFAULT_TIMEOUT_MS} ms`);
    }

    // oxlint-disable-next-line no-await-in-loop -- a poll
    await Bun.sleep(options.intervalMs ?? DEFAULT_INTERVAL_MS);
  }
}

const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_INTERVAL_MS = 5;
