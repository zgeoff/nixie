import { planRetiredVersion } from './plan-retired-version';
import type { RetireRequest, StoreParts, VersionRef } from './types';
import type { VersionExtras } from './write-memory-version';
import { writeMemoryVersion } from './write-memory-version';

export function writeRetirement(
  parts: StoreParts,
  request: RetireRequest,
  extras: VersionExtras = {},
): Promise<VersionRef> {
  return writeMemoryVersion(parts, { ...planRetiredVersion(request), ...extras });
}
