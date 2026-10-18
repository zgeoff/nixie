import { hostImplementer } from './host-implementer';
import { requireHostMemory } from './require-host-memory';
import type { ReadHostMemory } from './types';

// Builds the host procedure that counts the memory items and proposals of each subject, which an
// operator compares with the subjects migration's dry run once the release starts.
export function buildHostSubjectsProcedure(readMemory: ReadHostMemory) {
  return hostImplementer.memory.subjects.handler((options) =>
    requireHostMemory(readMemory, options.errors.MEMORY_NOT_STARTED).countSubjects(),
  );
}
