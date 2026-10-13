import { waitAtFaultPoint } from '@heynixie/tasks';
import { memoryWriterTaskID } from './memory-writer-task-id';
import type { GatedWrite } from './write-memory-batch';
import type { GateBatch, SourceMessage, StagedWrite, WriterGate } from './writer-types';

export interface GateLookups {
  // the batch's readable message a write cites, or undefined for one outside the batch
  readonly findSource: (sequence: number) => SourceMessage | undefined;

  // whether the session was shown an item with exactly this text
  readonly isShownText: (text: string) => boolean;

  // the batch the writes belong to, which each proposal names
  readonly batch: GateBatch;
}

// Gates each staged write against the source it cites, one at a time and outside any transaction.
// A write that repeats a current item's text exactly writes nothing. A gate that throws partway
// releases what it made for the writes it already gated.
export async function runWriterGate(
  gate: WriterGate,
  writes: readonly StagedWrite[],
  lookups: GateLookups,
): Promise<readonly GatedWrite[]> {
  const gated: GatedWrite[] = [];

  try {
    await collectVerdicts(
      {
        gate,
        lookups,
        onGated: (entry) => {
          gated.push(entry);
        },
      },
      writes,
    );
  } catch (error) {
    await gate.release(gated.map((entry) => entry.verdict));
    throw error;
  }
  if (NIXIE_TEST_BUILD) {
    await waitAtFaultPoint('writer.batch.gated', { kind: 'task', id: memoryWriterTaskID });
  }
  return gated;
}

interface VerdictCollection {
  readonly gate: WriterGate;
  readonly lookups: GateLookups;

  // takes each gated write as it comes, so the caller can release them when a later check throws
  readonly onGated: (entry: GatedWrite) => void;
}

async function collectVerdicts(
  collection: VerdictCollection,
  writes: readonly StagedWrite[],
): Promise<void> {
  const lookups = collection.lookups;

  for (const write of writes) {
    const source = lookups.findSource(write.sourceSequence);
    const isRepeat = write.op === 'remember' && lookups.isShownText(write.text);

    if (source !== undefined && !isRepeat) {
      // oxlint-disable-next-line no-await-in-loop -- the checker takes one write at a time
      const verdict = await collection.gate.check(write, source, lookups.batch);

      collection.onGated({ write, verdict });
    }
  }
}
