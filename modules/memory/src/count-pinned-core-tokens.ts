import { countTextTokens } from '@heynixie/compaction';
import type { ContentSource } from '@heynixie/log';
import type { MemoryApproval } from '@heynixie/sessions';
import { renderSubjectGroups } from '@heynixie/sessions';
import type { MemoryContext, MemoryOrigin, MemorySubject } from './types';

// One item of the pinned core, as the opening renders it.
export interface CorePin {
  // the item, the short ID the core shows it by, and the subject whose heading it sits under
  readonly itemID: string;
  readonly shortID: string;
  readonly subject: MemorySubject;

  // the version, the text the core holds, where it came from and the quote it came up in
  readonly version: number;
  readonly text: string;
  readonly origin: MemoryOrigin;
  readonly source: ContentSource;
  readonly approval: MemoryApproval | null;
  readonly evidenceQuote: string | null;
}

// a day that renders as wide as any can, 30 Sep 2000, because the count's time now is in 1970
const widestDay = Date.UTC(2000, 8, 30);

// Counts the tokens of a pinned core as the opening renders it: each subject's heading and each
// item, with the owner's name and with the date at its widest.
export function countPinnedCoreTokens(
  context: Pick<MemoryContext, 'gate'>,
  core: readonly CorePin[],
): number {
  if (core.length === 0) {
    return 0;
  }

  const lines = { ownerName: context.gate.ownerName, defaultZone: 'UTC', now: new Date(0) };

  return countTextTokens(
    renderSubjectGroups(
      core.map((item) => ({ ...item, recordedAt: widestDay })),
      lines,
    ).join('\n'),
  );
}
