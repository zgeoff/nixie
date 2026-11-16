import type { WriteCaller } from '../gate/gate-context';
import { SelfNoteError } from '../utils/error/self-note-error';

// Only the conversation speaks as nixie's persona, so only it writes a self-note: its text, its
// labels or its subject.
export function requireSelfNoteCaller(caller: Pick<WriteCaller, 'origin'>): void {
  if (caller.origin !== 'conversation') {
    throw new SelfNoteError(
      `only the conversation writes a self-note, and this write came from the ${caller.origin}`,
    );
  }
}
