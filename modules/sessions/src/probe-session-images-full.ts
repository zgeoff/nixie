import type { StepInput } from '@heynixie/tasks';
import { countImages } from './count-images';
import { isPastImageBudget } from './is-past-image-budget';
import { readInboxMessages } from './read-inbox-messages';
import { sessionImageBudget } from './session-image-budget';
import type { ConversationRun, ImageTally } from './types';

export interface SessionImages {
  readonly inbox: StepInput['inbox'];
  readonly wake: StepInput['wake'];

  readonly images: ImageTally;
}

export async function probeSessionImagesFull(
  run: Pick<ConversationRun, 'context' | 'defaultZone' | 'messaging'>,
  session: SessionImages,
): Promise<boolean> {
  if (session.images.count === 0) {
    return false;
  }

  const times = { defaultZone: run.defaultZone, now: new Date(run.context.clock.now()) };

  const [first] = await readInboxMessages(run.context.log, session.inbox.slice(0, 1), {
    times,
    view: { messaging: run.messaging, wake: session.wake },
    imageBudget: { bytes: 0, count: 0 },
  });

  return (
    first !== undefined && isPastImageBudget(session.images, countImages(first), sessionImageBudget)
  );
}
