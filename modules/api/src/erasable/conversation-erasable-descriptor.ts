import type { ErasableDescriptor } from '@heynixie/log';

export const conversationErasableDescriptor = {
  kind: 'conversation',
  recordKinds: { erasable: [], forgettable: [], unforgettable: [] },
  legacyEnds: [{ kind: 'log_reset', where: { mode: 'conversations' } }],
} as const satisfies ErasableDescriptor;
