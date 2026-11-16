import { systemClock } from '@heynixie/clock';
import { createProposal } from '@heynixie/memory/test-utils';
import { startDataLog } from './start-data-log';
import { startSeedMemory } from './start-seed-memory';
import type { BootFiles } from './write-boot-files';

export interface MemoryItemsSeed {
  readonly itemID: string;
}

// Writes one item with 2 versions, labels, a pending proposal and a rejected one, the values a
// release before the evidence purge also wrote. No nixie may hold the data's writer lock.
export async function seedMemoryItems(
  nixie: Pick<BootFiles, 'dataDir' | 'deploymentKey'>,
): Promise<MemoryItemsSeed> {
  const data = await startDataLog({
    dataDir: nixie.dataDir,
    deploymentKey: nixie.deploymentKey,
    clock: systemClock,
  });

  try {
    const memory = await startSeedMemory(data.context);

    try {
      const provenance = {
        origin: 'owner',
        source: 'owner',
        taskID: null,
        proposalID: null,
        checks: null,
      } as const;

      const first = await memory.remember({
        text: 'Keeps bees on the allotment',
        labels: { gist: 'keeps bees', topic: 'garden', triggers: ['bees'] },
        provenance,
      });

      const second = await memory.remember({
        text: 'Keeps two hives on the allotment',
        target: first,
        provenance,
      });

      const rejected = await createProposal(memory, {
        text: 'Keeps three hives on the allotment',
        target: second,
      });

      await memory.proposals.reject({
        proposalID: rejected.proposalID,
        actionHash: rejected.actionHash,
        identityID: 'identity-1',
      });

      await createProposal(memory, { text: 'Keeps four hives on the allotment', target: second });

      return { itemID: first.itemID };
    } finally {
      await memory.stop();
    }
  } finally {
    await data.writer.stop();
  }
}
