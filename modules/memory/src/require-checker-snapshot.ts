import type { JSONObject } from '@heynixie/log';
import { z } from 'zod';
import { StaleCheckerError } from './stale-checker-error';
import type { MemoryContext } from './types';

const checkedSnapshot = z.object({ checker: z.object({ snapshotHash: z.string() }) });

export function requireCheckerSnapshot(
  context: Pick<MemoryContext, 'definitions'>,
  checks: JSONObject | null,
): void {
  const parsed = checkedSnapshot.safeParse(checks);

  if (!parsed.success) {
    return;
  }

  const checked = parsed.data.checker.snapshotHash;
  const inForce = context.definitions().snapshotHash;

  if (checked !== inForce) {
    throw new StaleCheckerError(checked, inForce);
  }
}
