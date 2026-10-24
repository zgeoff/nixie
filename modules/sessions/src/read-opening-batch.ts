import type { Log } from '@heynixie/log';
import type { StepInput } from '@heynixie/tasks';
import { countImages } from './count-images';
import { mergeImageTallies } from './merge-image-tallies';
import type { LiveImages } from './read-live-inbox';
import type { TurnBatch } from './read-turn-batch';
import { readTurnBatch } from './read-turn-batch';
import type { TaskMessageView } from './render-task-message';
import { sessionImageBudget } from './session-image-budget';
import type { ImageTally, MessageTimeOptions } from './types';

export interface OpeningBatch {
  readonly batch: TurnBatch;

  readonly images: LiveImages;
}

interface OpeningRead {
  readonly times: MessageTimeOptions;
  readonly view: TaskMessageView;

  readonly images: ImageTally;
}

export async function readOpeningBatch(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  inbox: StepInput['inbox'],
  read: OpeningRead,
): Promise<OpeningBatch> {
  const batch = await readTurnBatch(log, inbox, {
    times: read.times,
    view: read.view,
    imageBudget: {
      bytes: sessionImageBudget.bytes - read.images.bytes,
      count: sessionImageBudget.count - read.images.count,
    },
  });

  const spent = mergeImageTallies(
    read.images,
    ...batch.messages.map((message) => countImages(message)),
  );

  return { batch, images: { spent, budget: sessionImageBudget, isCapped: false } };
}
