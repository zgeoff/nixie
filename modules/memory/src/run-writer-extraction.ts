import { waitAtFaultPoint } from '@heynixie/tasks';
import { memoryWriterTaskID } from './memory-writer-task-id';
import { readShownItems } from './read-shown-items';
import type { WriterBatch } from './read-writer-batch';
import { renderShownText } from './render-shown-text';
import { renderWriterPrompt } from './render-writer-prompt';
import { renderWriterSystemPrompt } from './render-writer-system-prompt';
import type { WriterParts } from './writer-parts';
import type { BatchMessage, StagedWrite, WriterUsage } from './writer-types';

export interface WriterExtraction {
  readonly writes: readonly StagedWrite[];

  // the session's token counts, or null when the batch needed no session
  readonly usage: WriterUsage | null;

  // the current text of every item the session was first shown
  readonly shownTexts: ReadonlySet<string>;
}

// Runs one fresh model session over the batch, with the items it may revise, and collects what the
// session staged. A batch with none of your messages left to read needs no session.
export async function runWriterExtraction(
  parts: WriterParts,
  batch: WriterBatch,
  signal: AbortSignal,
): Promise<WriterExtraction> {
  if (batch.sources.size === 0) {
    return { writes: [], usage: null, shownTexts: new Set() };
  }
  const shown = await readShownItems(parts.store, {
    text: [...batch.sources.values()].map((source) => source.text).join('\n'),
    listTokens: parts.config.itemListTokens,
    topItems: parts.config.topItems,
    thread: memoryWriterTaskID,
  });

  parts.staging.open({
    sources: batch.sources,
    shown: new Map(shown.items.map((item) => [item.itemID, item.version])),
  });

  const prompt = renderWriterPrompt({ ...shown, messages: buildBatchMessages(batch) });
  const session = await runSession(parts, { prompt, signal });

  if (NIXIE_TEST_BUILD) {
    await waitAtFaultPoint('writer.batch.extracted', { kind: 'task', id: memoryWriterTaskID });
  }
  return { ...session, shownTexts: new Set(shown.items.map((item) => item.text)) };
}

// each readable record, with your pasted spans marked
function buildBatchMessages(batch: WriterBatch): readonly BatchMessage[] {
  return batch.entries.flatMap((entry) => {
    if (entry.text === null) {
      return [];
    }
    const shown = entry.role === 'owner' ? renderShownText(entry.text, entry.spans) : entry.text;

    return [{ sequence: entry.sequence, role: entry.role, shown, recordedAt: entry.recordedAt }];
  });
}

interface SessionRequest {
  readonly prompt: string;
  readonly signal: AbortSignal;
}

// the staging closes whether the session ends or fails, so a failed batch leaves nothing staged
async function runSession(
  parts: WriterParts,
  session: SessionRequest,
): Promise<Pick<WriterExtraction, 'writes' | 'usage'>> {
  try {
    const usage = await parts.model.runSession({
      systemPrompt: renderWriterSystemPrompt(parts.getPersona()),
      prompt: session.prompt,
      signal: session.signal,
    });

    return { writes: parts.staging.close(), usage };
  } catch (error) {
    parts.staging.close();
    throw error;
  }
}
