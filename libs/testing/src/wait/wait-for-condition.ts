export interface WaitForConditionOptions {
  readonly timeoutMs?: number;
  readonly intervalMs?: number;

  readonly now?: () => number;
}

const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_INTERVAL_MS = 5;

// Work behind a test clock still does real database I/O, which a test clock cannot advance, so the
// poll runs on the real clock. The deadline reads the monotonic clock: a paused virtual machine
// steps the wall clock forward on resume, which ended a 30 s wait after 4 s of test time.
export async function waitForCondition(
  check: () => boolean | Promise<boolean>,
  options: WaitForConditionOptions = {},
): Promise<void> {
  const now = options.now ?? (() => performance.now());
  const deadline = now() + (options.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  while (!(await check())) {
    if (now() >= deadline) {
      throw new Error(`condition not met within ${options.timeoutMs ?? DEFAULT_TIMEOUT_MS} ms`);
    }

    await Bun.sleep(options.intervalMs ?? DEFAULT_INTERVAL_MS);
  }
}
