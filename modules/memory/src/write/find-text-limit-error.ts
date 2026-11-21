import { countCodePoints, formatOverLimit } from '@heynixie/tools';
import type { MemorySubject } from '../types';

// The limit hangs on the subject, which an edit that keeps it reads from the stored item, so no
// schema can state it. The text reads as a schema's maxLength error does.
const textLimits: Readonly<Record<MemorySubject, number>> = {
  owner: 2000,
  shared: 2000,
  self: 6000,
};

export function findTextLimitError(text: string, subject: MemorySubject): string | null {
  const size = countCodePoints(text);
  const limit = textLimits[subject];

  return size > limit ? `data/text ${formatOverLimit(size, limit, 'characters')}` : null;
}
