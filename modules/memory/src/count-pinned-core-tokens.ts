import { countTextTokens } from '@heynixie/compaction';
import type { ContentSource } from '@heynixie/log';
import type { MemoryApproval } from '@heynixie/sessions';
import { renderSubjectGroups } from '@heynixie/sessions';
import type { MemoryContext, MemoryOrigin, MemorySubject } from './types';

export interface CorePin {
  readonly itemID: string;
  readonly shortID: string;
  readonly subject: MemorySubject;

  readonly version: number;
  readonly text: string;
  readonly origin: MemoryOrigin;
  readonly source: ContentSource;
  readonly approval: MemoryApproval | null;
  readonly evidenceQuote: string | null;
}

const widestDay = Date.UTC(2000, 8, 30);

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
