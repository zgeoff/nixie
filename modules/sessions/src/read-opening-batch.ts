import type { Log } from '@heynixie/log';
import type { StepInput } from '@heynixie/tasks';
import { countImages } from './count-images';
import { mergeImageTallies } from './merge-image-tallies';
import type { LiveImages } from './read-live-inbox';
import type { TurnBatch } from './read-turn-batch';
import { readTurnBatch } from './read-turn-batch';
import type { TaskMessageView } from './render-task-message';
import type { ImageTally, MessageTimeOptions } from './types';

export interface OpeningBatch {
  readonly batch: TurnBatch;

  readonly images: LiveImages;
}

interface OpeningRead {
  readonly times: MessageTimeOptions;
  readonly view: TaskMessageView;

  readonly images: ImageTally;
  readonly imageBudget: ImageTally;
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
      bytes: read.imageBudget.bytes - read.images.bytes,
      count: read.imageBudget.count - read.images.count,
    },
  });

  const spent = mergeImageTallies(
    read.images,
    ...batch.messages.map((message) => countImages(message)),
  );

  return { batch, images: { spent, budget: read.imageBudget, isCapped: false } };
}
