import { buildWriterGate } from './build-writer-gate';
import type { MemoryWrites } from './gate-types';
import type { StoreParts } from './types';
import { withFreshChecker } from './with-fresh-checker';
import { writeGatedPin } from './write-gated-pin';
import { writeGatedRemember } from './write-gated-remember';
import { writeGatedRetirement } from './write-gated-retirement';
import { writeUnpin } from './write-unpin';

export function buildMemoryWrites(parts: StoreParts): MemoryWrites {
  return {
    remember: (request) => withFreshChecker(() => writeGatedRemember(parts, request)),
    retire: (request) => withFreshChecker(() => writeGatedRetirement(parts, request)),
    pin: (request) => writeGatedPin(parts, request),
    unpin: (request) => writeUnpin(parts, request),
    batch: buildWriterGate(parts),
  };
}
