import type { WriteCaller } from '../gate/gate-context';
import { hasSelfNoteGrant } from '../gate/has-self-note-grant';
import type { MemorySubject } from '../types';
import { SelfNoteError } from '../utils/error/self-note-error';

// A task with the self-note grant writes only about the assistant. Every subject the write touches
// must be self, the item's current one and the one it moves to.
export function requireGrantedSelfSubject(
  caller: WriteCaller,
  subjects: readonly MemorySubject[],
): void {
  const other = subjects.find((subject) => subject !== 'self');

  if (hasSelfNoteGrant(caller) && other !== undefined) {
    throw new SelfNoteError(
      `this task's definition grants it self-note writes only, so it may write only items whose subject is self, and this write touches an item whose subject is ${other}`,
    );
  }
}
