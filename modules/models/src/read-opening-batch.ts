import type { Log } from '@heynixie/log';
import type { StepInput } from '@heynixie/tasks';
import { countImageBytes } from './count-image-bytes';
import type { LiveImages } from './read-live-inbox';
import type { TurnBatch } from './read-turn-batch';
import { readTurnBatch } from './read-turn-batch';
import { sessionImageBudgetBytes } from './session-image-budget-bytes';
import type { MessageTimeOptions } from './types';

export interface OpeningBatch {
  readonly batch: TurnBatch;

  // the session's image bytes after the batch, which the live messages add to
  readonly images: LiveImages;
}

interface OpeningRead {
  readonly times: MessageTimeOptions;

  // the image bytes, in base64, the session holds before the turn
  readonly imageBytes: number;
}

// Reads the batch a turn opens with, as much of the session's image budget as the session leaves.
export async function readOpeningBatch(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  inbox: StepInput['inbox'],
  read: OpeningRead,
): Promise<OpeningBatch> {
  const batch = await readTurnBatch(log, inbox, {
    times: read.times,
    imageBudgetBytes: sessionImageBudgetBytes - read.imageBytes,
  });

  const opened = batch.messages.reduce((total, message) => total + countImageBytes(message), 0);

  return {
    batch,
    images: { spent: read.imageBytes + opened, budget: sessionImageBudgetBytes, isCapped: false },
  };
}
