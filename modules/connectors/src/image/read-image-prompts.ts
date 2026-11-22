import type { Log } from '@heynixie/log';
import { readRecords } from '@heynixie/log';
import { z } from 'zod';
import type { ImageRow } from './image-tables';

export interface ImagePrompt {
  // null for an imported image, which has no prompt
  readonly prompt: string | null;

  // true when a forget made the result record unreadable
  readonly isForgotten: boolean;
}

const storedResultSchema = z.object({
  result: z.object({ prompt: z.string().nullable().optional() }),
});

// What each image's result record says it was drawn from, by the images' IDs.
export async function readImagePrompts(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  rows: readonly ImageRow[],
): Promise<ReadonlyMap<string, ImagePrompt>> {
  const prompts = new Map<string, ImagePrompt>();

  if (rows.length === 0) {
    return prompts;
  }

  const sequences = rows.map((row) => row.sequence);

  const entries = await readRecords(log, {
    afterSequence: Math.min(...sequences) - 1,
    sequences,
    limit: sequences.length,
  });

  for (const row of rows) {
    const entry = entries.find((candidate) => candidate.record.sequence === row.sequence);
    const erasable = entry?.record.erasable;

    if (erasable?.status !== 'readable') {
      prompts.set(row.image_id, { prompt: null, isForgotten: true });
      continue;
    }

    const parsed = storedResultSchema.safeParse(erasable.fields);

    prompts.set(row.image_id, {
      prompt: parsed.success ? (parsed.data.result.prompt ?? null) : null,
      isForgotten: false,
    });
  }

  return prompts;
}
