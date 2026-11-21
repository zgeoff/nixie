import { ImageSourceError } from './image-source-error';
import { ItemPurgingError } from './item-purging-error';
import { MemoryItemNotFoundError } from './memory-item-not-found-error';
import { MemoryStateError } from './memory-state-error';
import { NotPinnedError } from './not-pinned-error';
import { PinnedCoreFullError } from './pinned-core-full-error';
import { ProposalCapError } from './proposal-cap-error';
import { QuotedRecordForgettingError } from './quoted-record-forgetting-error';
import { SelfNoteError } from './self-note-error';
import { StaleVersionError } from './stale-version-error';
import { TextLimitError } from './text-limit-error';
import { UntilPassedError } from './until-passed-error';

// An error that a write call returns to the model as a message, and not as a failure of the tool.
export function isWriteRefusal(error: unknown): error is Error {
  return (
    error instanceof StaleVersionError ||
    error instanceof MemoryItemNotFoundError ||
    error instanceof MemoryStateError ||
    error instanceof NotPinnedError ||
    error instanceof PinnedCoreFullError ||
    error instanceof ProposalCapError ||
    error instanceof SelfNoteError ||
    error instanceof ImageSourceError ||
    error instanceof ItemPurgingError ||
    error instanceof QuotedRecordForgettingError ||
    error instanceof UntilPassedError ||
    error instanceof TextLimitError
  );
}
