import { systemClock } from '@heynixie/clock';
import { writeRecords } from '@heynixie/log';
import type { StartedMemoryStore } from '@heynixie/memory';
import {
  createProposal,
  seedBegunPurge as seedMemoryBegunPurge,
  seedSharedKeyVersion,
  writeOwnerMessageRecord,
} from '@heynixie/memory/test-utils';
import { buildTaskSeeder } from '@heynixie/tasks/test-utils';
import { startDataLog } from './start-data-log';
import { startSeedMemory } from './start-seed-memory';
import type { BootFiles } from './write-boot-files';

export interface BegunPurgeSeed {
  // the message that the forget removed
  readonly recordSequence: number;

  // an item that quotes the message, with 2 versions and a pending proposal, and labels unless the
  // item is shared-key
  readonly itemID: string;
  readonly proposalID: string;
}

export interface BegunPurgeOptions {
  // False writes the purge set with no record forget behind it, as a scrub does
  readonly isOwned: boolean;

  // True writes the item as an earlier release did, with each version under the item's own key
  // and no labels, so the purge writes a bridge version.
  readonly isSharedKey?: boolean;

  // True also begins the item's own forget after the purge set, and stops it before any key goes
  readonly isItemForgetting?: boolean;
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

      const [first, second] =
        options?.isSharedKey === true
          ? await seedSharedKeyItem(testLog.context.log, recordSequence)
          : await rememberItem(memory, recordSequence);

      const proposal = await createProposal(memory, {
        text: 'Keeps three hives on the allotment',
        target: second,
      });

      await seedMemoryBegunPurge(testLog.context.log, {
        recordSequence: options?.isOwned === false ? null : recordSequence,
        itemIDs: [first.itemID],
      });

      if (options?.isItemForgetting === true) {
        await writeRecords(testLog.context.log, [
          {
            kind: 'memory.forget_started',
            definitions: { snapshotHash: 'sha256:test' },
            payload: {
              itemID: second.itemID,
              version: second.version,
              evidenceSequences: [recordSequence],
            },
          },
        ]);
      }

      return { recordSequence, itemID: first.itemID, proposalID: proposal.proposalID };
    } finally {
      await memory.stop();
    }
  } finally {
    await testLog.writer.stop();
  }
}

async function seedSharedKeyItem(
  log: Parameters<typeof seedSharedKeyVersion>[0],
  recordSequence: number,
) {
  const first = await seedSharedKeyVersion(log, {
    text: 'Keeps bees on the allotment',
    evidence: { recordSequence, start: 0, end: 11 },
    evidenceQuote: 'I keep bees',
  });

  const second = await seedSharedKeyVersion(log, {
    target: first,
    text: 'Keeps two hives on the allotment',
  });

  return [first, second] as const;
}

const provenance = {
  origin: 'owner',
  source: 'owner',
  taskID: null,
  proposalID: null,
  checks: null,
} as const;

async function rememberItem(memory: StartedMemoryStore, recordSequence: number) {
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

  return [first, second] as const;
}
