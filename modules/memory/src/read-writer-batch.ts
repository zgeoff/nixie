import type { Log } from '@heynixie/log';
import type { BacklogEntry } from './read-writer-backlog';
import { readWriterBacklog } from './read-writer-backlog';
import type { BatchBounds, SourceMessage } from './writer-types';

export interface WriterBatch {
  readonly bounds: BatchBounds;
  readonly entries: readonly BacklogEntry[];

  // your readable messages in the batch, by sequence, which a write may cite
  readonly sources: ReadonlyMap<number, SourceMessage>;
}

// Reads the conversation's records inside a batch's bounds. A message whose text is forgotten
// stays out of the sources, so no write can cite it.
export async function readWriterBatch(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  bounds: BatchBounds,
): Promise<WriterBatch> {
  const entries = await readWriterBacklog(log, {
    after: bounds.start,
    ownerLimit: Number.POSITIVE_INFINITY,
    through: bounds.end,
  });

  const sources = new Map<number, SourceMessage>(
    entries.flatMap((entry) =>
      entry.role === 'owner' && entry.text !== null
        ? [[entry.sequence, { sequence: entry.sequence, text: entry.text, spans: entry.spans }]]
        : [],
    ),
  );

  return { bounds, entries, sources };
}
