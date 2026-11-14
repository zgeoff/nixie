import type { VersionExtras } from '../memory/write-memory-version';
import { writeMemoryVersion } from '../memory/write-memory-version';
import { planRetiredVersion } from '../retired/plan-retired-version';
import type { RetireRequest, StoreParts, VersionRef } from '../types';

export function writeRetirement(
  parts: StoreParts,
  request: RetireRequest,
  extras: VersionExtras = {},
): Promise<VersionRef> {
  return writeMemoryVersion(parts, { ...planRetiredVersion(request), ...extras });
}
