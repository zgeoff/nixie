import type { WriteCaller } from '../gate/gate-context';
import { hasSelfNoteGrant } from '../gate/has-self-note-grant';
import { SelfNoteError } from '../utils/error/self-note-error';

// The self-note grant covers no pin: the pinned core stays with the conversation.
export function requirePinCaller(caller: WriteCaller): void {
  if (hasSelfNoteGrant(caller)) {
    throw new SelfNoteError(
      "this task's definition grants it self-note writes only, and a pin or an unpin is not one",
    );
  }
}
