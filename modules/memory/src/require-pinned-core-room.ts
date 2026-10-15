import { countTextTokens } from '@heynixie/compaction';
import type { ContentSource } from '@heynixie/log';
import type { MemoryApproval } from '@heynixie/sessions';
import { renderMemoryItem } from '@heynixie/sessions';
import { PinnedCoreFullError } from './pinned-core-full-error';
import type { MemoryContext, MemoryOrigin, RecalledItem } from './types';

export interface CorePin {
  // the item to pin, and the short ID the core shows it by
  readonly itemID: string;
  readonly shortID: string;

  // the version, the text the pin puts in the core, where it came from and the quote it came up in
  readonly version: number;
  readonly text: string;
  readonly origin: MemoryOrigin;
  readonly source: ContentSource;
  readonly approval: MemoryApproval | null;
  readonly evidenceQuote: string | null;
}

// a day that renders as wide as any can, 30 Sep 2000, because the count's time now is in 1970
const widestDay = Date.UTC(2000, 8, 30);

// The pinned core's budget, in tokens, when the context sets none.
const defaultPinnedCoreTokens = 2000;

// Fails when a pinned item would take the pinned core past its token budget, because the core
// rides in the cached start of every session. Each item counts as the opening renders it, with
// the owner's name, and with the date at its widest. The item's earlier version leaves the count.
export function requirePinnedCoreRoom(
  context: Pick<MemoryContext, 'pinnedCoreTokens' | 'gate'>,
  pinned: readonly RecalledItem[],
  pin: CorePin,
): void {
  const core = [...pinned.filter((item) => item.itemID !== pin.itemID), pin];
  const lines = { ownerName: context.gate.ownerName, defaultZone: 'UTC', now: new Date(0) };

  const tokens = core.reduce(
    (total, item) =>
      total +
      countTextTokens(renderMemoryItem({ ...item, recordedAt: widestDay }, lines).join('\n')),
    0,
  );

  const budget = context.pinnedCoreTokens ?? defaultPinnedCoreTokens;

  if (tokens > budget) {
    throw new PinnedCoreFullError(pin.itemID, tokens, budget);
  }
}
