import { countCodePoints, formatOverLimit } from '@heynixie/tools';
import type { MemorySubject } from '../types';

// The schema caps text at the self-note limit, so the subject's own limit is checked once the
// subject is known: from the call, or from the stored item for an edit that keeps it.
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
