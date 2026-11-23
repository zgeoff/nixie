import type { WriteCaller } from '../gate/gate-context';
import { hasSelfNoteGrant } from '../gate/has-self-note-grant';
import { SelfNoteError } from '../utils/error/self-note-error';

// The conversation speaks as nixie's persona, and so does a task whose definition grants it the
// self-note writes. Either may write a self-note: its text, its labels or its subject.
export function requireSelfNoteCaller(caller: WriteCaller): void {
  if (caller.origin !== 'conversation' && !hasSelfNoteGrant(caller)) {
    throw new SelfNoteError(
      `only the conversation writes a self-note, and this write came from the ${caller.origin}`,
    );
  }
}
