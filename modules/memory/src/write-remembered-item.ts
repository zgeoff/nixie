import { planRememberedVersion } from './plan-remembered-version';
import type { RememberRequest, StoreParts, VersionRef } from './types';
import type { VersionExtras } from './write-memory-version';
import { writeMemoryVersion } from './write-memory-version';

export function writeRememberedItem(
  parts: StoreParts,
  request: RememberRequest,
  extras: VersionExtras = {},
): Promise<VersionRef> {
  return writeMemoryVersion(parts, { ...planRememberedVersion(request), ...extras });
}
