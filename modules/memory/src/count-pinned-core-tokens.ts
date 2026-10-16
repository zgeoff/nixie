import { countTextTokens } from '@heynixie/compaction';
import type { ContentSource } from '@heynixie/log';
import type { MemoryApproval } from '@heynixie/sessions';
import { renderMemoryItem } from '@heynixie/sessions';
import type { MemoryContext, MemoryOrigin } from './types';

// One item of the pinned core, as the opening renders it.
export interface CorePin {
  // the item, and the short ID the core shows it by
  readonly itemID: string;
  readonly shortID: string;

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

// Counts the tokens of a pinned core. Each item counts as the opening renders it, with the owner's
// name, and with the date at its widest.
export function countPinnedCoreTokens(
  context: Pick<MemoryContext, 'gate'>,
  core: readonly CorePin[],
): number {
  const lines = { ownerName: context.gate.ownerName, defaultZone: 'UTC', now: new Date(0) };

  return core.reduce(
    (total, item) =>
      total +
      countTextTokens(renderMemoryItem({ ...item, recordedAt: widestDay }, lines).join('\n')),
    0,
  );
}
