import type { WriteCaller } from '../gate/gate-context';
import type { MemorySubject } from '../types';
import { SelfNoteError } from '../utils/error/self-note-error';

// A tool that only the self-note grant gives a task writes self-notes and nothing else: a task
// writes an owner or shared item only through a tool its definition lists.
export function requireSelfNoteOnlyWrite(
  caller: WriteCaller,
  subjects: readonly MemorySubject[],
): void {
  if (
    caller.origin === 'task' &&
    caller.isSelfNoteOnly &&
    subjects.some((subject) => subject !== 'self')
  ) {
    throw new SelfNoteError(
      'this task holds the tool only through its self-note grant, so it writes self-notes alone; ' +
        'an owner or shared item needs the tool in the task definition',
    );
  }
}
