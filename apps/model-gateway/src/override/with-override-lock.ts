import { withFileLock } from '@zgeoff/std/with-file-lock';

// A holder keeps the lock for one read and one write, so a waiter that gets no turn in this time
// finds a stuck holder. The kernel drops the lock of a killed process, so no holder blocks it for
// good.
const overrideLockWaitMs = 10_000;

export async function withOverrideLock<Value>(
  overridePath: string,
  fn: () => Promise<Value>,
  waitMs = overrideLockWaitMs,
): Promise<Value> {
  const result = await withFileLock(`${overridePath}.lock`, fn, { waitMs });

  if (result.kind === 'busy') {
    throw new Error(
      `the override file ${overridePath} stayed locked for ${String(waitMs)} ms, so another process holds it`,
    );
  }

  return result.value;
}
