import { countCodePoints, formatOverLimit } from '@heynixie/tools';
import type { MemorySubject } from '../types';

// The limit hangs on the subject, which an edit that keeps it reads from the stored item, so no
// schema can state it. The text reads as a schema's maxLength error does.
const textLimits: Readonly<Record<MemorySubject, number>> = {
  owner: 2000,
  shared: 2000,
  self: 6000,
};

// The assistant's tools point at a note for longer text. The owner's own writes do not, since the
// owner has no notebook tool to call.
export function findTextLimitError(
  text: string,
  subject: MemorySubject,
  pointsToNote = false,
): string | null {
  const size = countCodePoints(text);
  const limit = textLimits[subject];

  if (size <= limit) {
    return null;
  }

  const message = `data/text ${formatOverLimit(size, limit, 'characters')}`;

  return pointsToNote ? `${message}; for longer text, write a note with notebook.write` : message;
}
