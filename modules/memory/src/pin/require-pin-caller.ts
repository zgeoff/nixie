import type { WriteCaller } from '../gate/gate-context';
import { SelfNoteError } from '../utils/error/self-note-error';

// The self-note grant covers no pin: the pinned core stays with the conversation.
export function requirePinCaller(caller: Pick<WriteCaller, 'hasSelfNoteGrant'>): void {
  if (caller.hasSelfNoteGrant) {
    throw new SelfNoteError(
      "this task's definition grants it self-note writes only, and a pin or an unpin is not one",
    );
  }
}
