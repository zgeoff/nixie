import type { StepInput } from '@heynixie/tasks';
import type { InboxContext, InboxRead } from '../inbox/read-inbox-messages';
import type { LiveImages } from '../inbox/read-live-inbox';
import type { TaskMessageView } from '../task/render-task-message';
import type { ImageTally, MessageTimeOptions } from '../types';
import { countImages } from '../utils/count-images';
import { mergeImageTallies } from '../utils/merge-image-tallies';
import type { TurnBatch } from './read-turn-batch';
import { readTurnBatch } from './read-turn-batch';

export interface OpeningBatch {
  readonly batch: TurnBatch;

  readonly images: LiveImages;
}

interface OpeningRead {
  readonly times: MessageTimeOptions;
  readonly view: TaskMessageView;

  readonly images: ImageTally;
  readonly imageBudget: ImageTally;

  readonly replies?: InboxRead['replies'];
}

export async function readOpeningBatch(
  context: InboxContext,
  inbox: StepInput['inbox'],
  read: OpeningRead,
): Promise<OpeningBatch> {
  const batch = await readTurnBatch(context, inbox, {
    times: read.times,
    view: read.view,
    imageBudget: {
      bytes: read.imageBudget.bytes - read.images.bytes,
      count: read.imageBudget.count - read.images.count,
    },
    ...(read.replies === undefined ? {} : { replies: read.replies }),
  });

  const spent = mergeImageTallies(
    read.images,
    ...batch.messages.map((message) => countImages(message)),
  );

  return { batch, images: { spent, budget: read.imageBudget, isCapped: false } };
}
