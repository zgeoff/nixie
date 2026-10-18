import type { ViewItem } from '@heynixie/memory';

// An item as the contract carries it, with its times as dates and its text only while readable.
export function toContractMemoryItem(item: ViewItem) {
  return {
    itemID: item.itemID,
    shortID: item.shortID,
    state: item.state,
    isPinned: item.isPinned,
    kind: item.subject === 'self' ? ('self' as const) : ('fact' as const),
    subject: item.subject,
    version: item.version,
    origin: item.origin,
    source: item.source,
    createdAt: new Date(item.createdAt),
    changedAt: new Date(item.changedAt),
    forgottenAt: item.forgottenAt === null ? null : new Date(item.forgottenAt),
    status: item.status,
    ...(item.status === 'readable' ? { text: item.text } : {}),
  };
}
