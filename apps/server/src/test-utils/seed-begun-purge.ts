import { systemClock } from '@heynixie/clock';
import {
  createProposal,
  seedBegunPurge as seedMemoryBegunPurge,
  writeOwnerMessageRecord,
} from '@heynixie/memory/test-utils';
import { buildTaskSeeder } from '@heynixie/tasks/test-utils';
import { startDataLog } from './start-data-log';
import { startSeedMemory } from './start-seed-memory';
import type { BootFiles } from './write-boot-files';

export interface BegunPurgeSeed {
  // the message that the forget removed
  readonly recordSequence: number;

  // an item that quotes the message, with labels, 2 versions and a pending proposal
  readonly itemID: string;
  readonly proposalID: string;
}

export interface BegunPurgeOptions {
  // False writes the purge set with no record forget behind it, as a scrub does
  readonly isOwned: boolean;
}

// Leaves the data where a record forget stops after its first transaction: the forget began and the
// purge set is fixed, and nothing else ran. No nixie may hold the data's writer lock.
export async function seedBegunPurge(
  nixie: Pick<BootFiles, 'dataDir' | 'deploymentKey'>,
  options?: BegunPurgeOptions,
): Promise<BegunPurgeSeed> {
  const testLog = await startDataLog({
    dataDir: nixie.dataDir,
    deploymentKey: nixie.deploymentKey,
    clock: systemClock,
  });

  try {
    await buildTaskSeeder({ context: testLog.context }).conversationStep();

    const memory = await startSeedMemory(testLog.context);

    try {
      const message = 'I keep bees on the allotment.';

      const recordSequence = await writeOwnerMessageRecord(testLog.context.log, {
        thread: 'conversation',
        text: message,
        spans: [{ start: 0, end: message.length, source: 'typed' }],
      });

      const provenance = {
        origin: 'owner',
        source: 'owner',
        taskID: null,
        proposalID: null,
        checks: null,
      } as const;

      const first = await memory.remember({
        text: 'Keeps bees on the allotment',
        evidence: { recordSequence, start: 0, end: 11 },
        evidenceQuote: 'I keep bees',
        labels: { gist: 'keeps bees', topic: 'garden', triggers: ['bees'] },
        provenance,
      });

      const second = await memory.remember({
        text: 'Keeps two hives on the allotment',
        target: first,
        provenance,
      });

      const proposal = await createProposal(memory, {
        text: 'Keeps three hives on the allotment',
        target: second,
      });

      await seedMemoryBegunPurge(testLog.context.log, {
        recordSequence: options?.isOwned === false ? null : recordSequence,
        itemIDs: [first.itemID],
      });

      return { recordSequence, itemID: first.itemID, proposalID: proposal.proposalID };
    } finally {
      await memory.stop();
    }
  } finally {
    await testLog.writer.stop();
  }
}
