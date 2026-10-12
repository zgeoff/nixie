import { planRetiredVersion } from './plan-retired-version';
import type { RetireRequest, StoreParts, VersionRef } from './types';
import { writeMemoryVersion } from './write-memory-version';

// Adds a version that retires an active item. The text stays as it was, and the version carries
// your request to retire it when one exists.
export function writeRetirement(parts: StoreParts, request: RetireRequest): Promise<VersionRef> {
  return writeMemoryVersion(parts, planRetiredVersion(request));
}
