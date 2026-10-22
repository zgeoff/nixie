import { planRememberedVersion } from './plan-remembered-version';
import type { RememberRequest, StoreParts, VersionRef } from './types';
import { UntilPassedError } from './until-passed-error';
import type { VersionExtras } from './write-memory-version';
import { writeMemoryVersion } from './write-memory-version';

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
