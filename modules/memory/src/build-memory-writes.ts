import { buildWriterGate } from './build-writer-gate';
import type { MemoryWrites } from './gate-types';
import type { StoreParts } from './types';
import { writeGatedPin } from './write-gated-pin';
import { writeGatedRemember } from './write-gated-remember';
import { writeGatedRetirement } from './write-gated-retirement';
import { writeUnpin } from './write-unpin';

export function buildMemoryWrites(parts: StoreParts): MemoryWrites {
  return {
    remember: (request) => writeGatedRemember(parts, request),
    retire: (request) => writeGatedRetirement(parts, request),
    pin: (request) => writeGatedPin(parts, request),
    unpin: (request) => writeUnpin(parts, request),
    batch: buildWriterGate(parts),
  };
}
