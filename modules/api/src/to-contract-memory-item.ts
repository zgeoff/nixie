import type { ViewItem } from '@heynixie/memory';
import { toContractKind } from './to-contract-kind';

export function toContractMemoryItem(item: ViewItem) {
  return {
    itemID: item.itemID,
    shortID: item.shortID,
    state: item.state,
    isPinned: item.isPinned,
    isSensitive: item.isSensitive,
    kind: toContractKind(item.subject),
    subject: item.subject,
    version: item.version,
    origin: item.origin,
    source: item.source,
    createdAt: new Date(item.createdAt),
    changedAt: new Date(item.changedAt),
    forgottenAt: item.forgottenAt === null ? null : new Date(item.forgottenAt),
    until: item.until === null ? null : new Date(item.until),
    status: item.status,
    ...(item.status === 'readable' ? { text: item.text } : {}),
  };
}
