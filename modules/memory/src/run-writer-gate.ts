import { waitAtFaultPoint } from '@heynixie/tasks';
import { memoryWriterTaskID } from './memory-writer-task-id';
import type { WriterBatch } from './read-writer-batch';
import type { WriterExtraction } from './run-writer-extraction';
import type { GatedWrite } from './write-memory-batch';
import type { WriterGate } from './writer-types';

// Gates each staged write against the source it cites, one at a time and outside any transaction.
// A write that repeats a current item's text exactly writes nothing.
export async function runWriterGate(
  gate: WriterGate,
  batch: WriterBatch,
  extracted: WriterExtraction,
): Promise<readonly GatedWrite[]> {
  const gated: GatedWrite[] = [];

  for (const write of extracted.writes) {
    const source = batch.sources.get(write.sourceSequence);
    const isRepeat = write.op === 'remember' && extracted.shownTexts.has(write.text);

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
