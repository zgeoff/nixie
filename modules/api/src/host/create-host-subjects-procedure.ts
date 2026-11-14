import type { ReadHostMemory } from '../types';
import { hostImplementer } from './host-implementer';
import { requireHostMemory } from './require-host-memory';

export function createHostSubjectsProcedure(readMemory: ReadHostMemory) {
  return hostImplementer.memory.subjects.handler((options) =>
    requireHostMemory(readMemory, options.errors.MEMORY_NOT_STARTED).readSubjectCounts(),
  );
}
