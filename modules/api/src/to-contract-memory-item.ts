import type { ViewItem } from '@heynixie/memory';
import { toContractKind } from './to-contract-kind';

export function toContractMemoryItem(item: ViewItem) {
  return {
    itemID: item.itemID,
    shortID: item.shortID,
    state: item.state,
    isPinned: item.isPinned,
    kind: toContractKind(item.subject),
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
