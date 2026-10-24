import { renderPrompt } from '@heynixie/prompts';
import { waitAtFaultPoint } from '@heynixie/tasks';
import type { StagingHandle } from './create-writer-staging';
import { memoryWriterTaskID } from './memory-writer-task-id';
import { readShownItems } from './read-shown-items';
import type { WriterBatch } from './read-writer-batch';
import { renderShownText } from './render-shown-text';
import type { SpeakerNames } from './render-writer-prompt';
import { renderWriterPrompt } from './render-writer-prompt';
import type { WriterParts } from './writer-parts';
import { writerSubjects } from './writer-subjects';
import type { BatchMessage, StagedFlag, StagedWrite, WriterUsage } from './writer-types';

export interface WriterExtraction {
  readonly writes: readonly StagedWrite[];

  readonly flags: readonly StagedFlag[];

  readonly usage: WriterUsage | null;

  readonly shownTexts: ReadonlySet<string>;
}

export async function runWriterExtraction(
  parts: WriterParts,
  batch: WriterBatch,
  signal: AbortSignal,
): Promise<WriterExtraction> {
  if (batch.sources.size === 0) {
    return { writes: [], flags: [], usage: null, shownTexts: new Set() };
  }

  const shown = await readShownItems(parts.store, {
    text: [...batch.sources.values()].map((source) => source.text).join('\n'),
    listTokens: parts.config.itemListTokens,
    topItems: parts.config.topItems,
    thread: memoryWriterTaskID,
  });

  const staged = parts.staging.open({
    sources: batch.sources,
    startedAt: parts.context.clock.now(),
    shown: new Map(
      shown.items.map((item) => [item.itemID, { version: item.version, subject: item.subject }]),
    ),
  });

  const proposals = await parts.store.proposals.listPending({ subjects: writerSubjects });

  const prompt = renderWriterPrompt({
    ...shown,
    proposals,
    messages: buildBatchMessages(batch),
    names: buildSpeakerNames(parts),
    defaultZone: parts.defaultZone,
  });

  const session = await runSession(parts, { prompt, signal, staged });

  if (NIXIE_TEST_BUILD) {
    await waitAtFaultPoint('writer.batch.extracted', { kind: 'task', id: memoryWriterTaskID });
  }

  return {
    ...session,
    shownTexts: new Set([...shown.items.map((item) => item.text), ...staged.readRecalledTexts()]),
  };
}

function buildBatchMessages(batch: WriterBatch): readonly BatchMessage[] {
  return batch.entries.flatMap((entry) => {
    if (entry.text === null) {
      return [];
    }

    const shown =
      entry.role === 'owner'
        ? [renderShownText(entry.text, entry.spans), ...(entry.imageMarkers ?? [])].join('\n')
        : entry.text;

    return [
      {
        sequence: entry.sequence,
        role: entry.role,
        shown,
        recordedAt: entry.recordedAt,
        timeZone: entry.timeZone,
      },
    ];
  });
}

function buildSpeakerNames(parts: WriterParts): SpeakerNames {
  return { owner: parts.ownerName, assistant: parts.assistantName };
}

interface SessionRequest {
  readonly prompt: string;
  readonly signal: AbortSignal;
  readonly staged: StagingHandle;
}

async function runSession(
  parts: WriterParts,
  session: SessionRequest,
): Promise<Pick<WriterExtraction, 'writes' | 'flags' | 'usage'>> {
  try {
    const usage = await parts.model.runSession({
      systemPrompt: renderPrompt(
        'writer',
        {
          persona: parts.getPersona(),
          owner: { name: parts.ownerName },
          assistant: { name: parts.assistantName },
        },
        parts.getPrompts(),
      ),
      prompt: session.prompt,
      signal: session.signal,
    });

    return { writes: session.staged.close(), flags: session.staged.readFlags(), usage };
  } catch (error) {
    session.staged.close();
    throw error;
  }
}
