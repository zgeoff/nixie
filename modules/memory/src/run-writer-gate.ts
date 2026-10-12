import { waitAtFaultPoint } from '@heynixie/tasks';
import { memoryWriterTaskID } from './memory-writer-task-id';
import type { GatedWrite } from './write-memory-batch';
import type { SourceMessage, StagedWrite, WriterGate } from './writer-types';

export interface GateLookups {
  // the batch's readable message a write cites, or undefined for one outside the batch
  readonly findSource: (sequence: number) => SourceMessage | undefined;

  // whether the session was shown an item with exactly this text
  readonly isShownText: (text: string) => boolean;
}

// Gates each staged write against the source it cites, one at a time and outside any transaction.
// A write that repeats a current item's text exactly writes nothing.
export async function runWriterGate(
  gate: WriterGate,
  writes: readonly StagedWrite[],
  lookups: GateLookups,
): Promise<readonly GatedWrite[]> {
  const gated: GatedWrite[] = [];

  for (const write of writes) {
    const source = lookups.findSource(write.sourceSequence);
    const isRepeat = write.op === 'remember' && lookups.isShownText(write.text);

    if (source !== undefined && !isRepeat) {
      // oxlint-disable-next-line no-await-in-loop -- the checker takes one write at a time
      const verdict = await gate.check(write, source);

      gated.push({ write, verdict });
    }
  }
  if (NIXIE_TEST_BUILD) {
    await waitAtFaultPoint('writer.batch.gated', { kind: 'task', id: memoryWriterTaskID });
  }
  return gated;
}
