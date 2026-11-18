import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { withFileLock } from '@zgeoff/std/with-file-lock';

// A holder keeps the lock for one read and one write, so a waiter that gets no turn in this time
// finds a stuck holder. The kernel drops the lock of a killed process, so no holder blocks it for
// good.
export const loginLockWaitMs = 10_000;

export async function withLoginLock<Value>(
  loginPath: string,
  fn: () => Promise<Value>,
  waitMs = loginLockWaitMs,
): Promise<Value> {
  await mkdir(dirname(loginPath), { recursive: true });

  const result = await withFileLock(`${loginPath}.lock`, fn, { waitMs });

  if (result.kind === 'busy') {
    throw new Error(
      `the login file ${loginPath} stayed locked for ${String(waitMs)} ms, so another process holds it`,
    );
  }

  return result.value;
}
