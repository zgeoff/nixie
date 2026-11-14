import type { VersionExtras } from '../memory/write-memory-version';
import { writeMemoryVersion } from '../memory/write-memory-version';
import type { RememberRequest, StoreParts, VersionRef } from '../types';
import { UntilPassedError } from '../utils/error/until-passed-error';
import { planRememberedVersion } from '../version/plan-remembered-version';

export function writeRememberedItem(
  parts: StoreParts,
  request: RememberRequest,
  extras: VersionExtras = {},
): Promise<VersionRef> {
  const now = parts.context.gate.clock.now();

  if (request.until !== undefined && request.until !== null && request.until <= now) {
    return Promise.reject(new UntilPassedError(request.until, now));
  }

  return writeMemoryVersion(parts, { ...planRememberedVersion(request), ...extras });
}
