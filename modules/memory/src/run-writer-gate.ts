import { waitAtFaultPoint } from '@heynixie/tasks';
import { memoryWriterTaskID } from './memory-writer-task-id';
import type { GatedWrite } from './write-memory-batch';
import type { GateBatch, SourceMessage, StagedWrite, WriterGate } from './writer-types';

export interface GateLookups {
  readonly findSource: (sequence: number) => SourceMessage | undefined;

  readonly isShownText: (text: string) => boolean;

  readonly batch: GateBatch;
}

export async function runWriterGate(
  gate: WriterGate,
  writes: readonly StagedWrite[],
  lookups: GateLookups,
): Promise<readonly GatedWrite[]> {
  const gated: GatedWrite[] = [];

  try {
    await readVerdicts(
      {
        gate,
        lookups,
        onGated: (entry) => {
          gated.push(entry);
        },
      },
      writes,
    );

    if (NIXIE_TEST_BUILD) {
      await waitAtFaultPoint('writer.batch.gated', { kind: 'task', id: memoryWriterTaskID });
    }
  } catch (error) {
    await gate.release(gated.map((entry) => entry.verdict));

    throw error;
  }

  return gated;
}

interface VerdictCollection {
  readonly gate: WriterGate;
  readonly lookups: GateLookups;

  readonly onGated: (entry: GatedWrite) => void;
}

async function readVerdicts(
  collection: VerdictCollection,
  writes: readonly StagedWrite[],
): Promise<void> {
  const lookups = collection.lookups;

  for (const write of writes) {
    const source = lookups.findSource(write.sourceSequence);
    const isRepeat = write.op === 'remember' && lookups.isShownText(write.text);

    if (source !== undefined && !isRepeat) {
      const verdict = await collection.gate.check(write, source, lookups.batch);

      if (verdict !== null) {
        collection.onGated({ write, verdict });
      }
    }
  }
}
