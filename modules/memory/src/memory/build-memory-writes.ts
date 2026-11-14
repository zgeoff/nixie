import { withFreshChecker } from '../checker/with-fresh-checker';
import type { MemoryWrites } from '../gate/gate-context';
import { writeGatedPin } from '../gated/write-gated-pin';
import { writeGatedRemember } from '../gated/write-gated-remember';
import { writeGatedRetirement } from '../gated/write-gated-retirement';
import { writeCallerSensitiveMark } from '../sensitive/write-caller-sensitive-mark';
import type { StoreParts } from '../types';
import { buildWriterGate } from '../writer/build-writer-gate';
import { writeUnpin } from './write-unpin';

export function buildMemoryWrites(parts: StoreParts): MemoryWrites {
  return {
    remember: (request) => withFreshChecker(() => writeGatedRemember(parts, request)),
    retire: (request) => withFreshChecker(() => writeGatedRetirement(parts, request)),
    pin: (request) => writeGatedPin(parts, request),
    unpin: (request) => writeUnpin(parts, request),
    markSensitive: (request) => writeCallerSensitiveMark(parts, request),
    batch: buildWriterGate(parts),
  };
}
