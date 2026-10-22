import type { PinnedCoreUse, StatusEntry } from '@heynixie/sessions';

export function buildPinnedCoreStatus(
  readUse: () => Promise<PinnedCoreUse>,
): readonly StatusEntry[] {
  return [
    {
      name: 'pinned_items',
      read: async () => {
        const use = await readUse();

        return {
          value: use.items,
          text: `Pinned memory: ${String(use.items)} ${use.items === 1 ? 'item' : 'items'}`,
        };
      },
    },
    {
      name: 'pinned_tokens',
      read: async () => {
        const use = await readUse();

        return {
          value: use.tokens,
          text: `Pinned memory tokens: ${String(use.tokens)} of ${String(use.budget)}`,
        };
      },
    },
  ];
}
