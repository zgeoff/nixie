import { buildWriterGate } from './build-writer-gate';
import type { MemoryWrites } from './gate-types';
import type { StoreParts } from './types';
import { writeGatedRemember } from './write-gated-remember';
import { writeGatedRetirement } from './write-gated-retirement';

export function buildMemoryWrites(parts: StoreParts): MemoryWrites {
  return {
    remember: (request) => writeGatedRemember(parts, request),
    retire: (request) => writeGatedRetirement(parts, request),
    batch: buildWriterGate(parts),
  };
}
