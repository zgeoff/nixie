import type { StepInput } from '@heynixie/tasks';
import { countImages } from './count-images';
import { isPastImageBudget } from './is-past-image-budget';
import { readInboxMessages } from './read-inbox-messages';
import { sessionImageBudget } from './session-image-budget';
import type { ConversationRun, ImageTally } from './types';

export interface SessionImages {
  readonly inbox: StepInput['inbox'];

  // the images the session holds after its last turn
  readonly images: ImageTally;
}

// Whether the images the session holds leave no room for those of the inbox's first message, which
// a turn always takes, so the session must open again. A message with no images always fits.
export async function probeSessionImagesFull(
  run: Pick<ConversationRun, 'context' | 'defaultZone'>,
  session: SessionImages,
): Promise<boolean> {
  if (session.images.count === 0) {
    return false;
  }

  const times = { defaultZone: run.defaultZone, now: new Date(run.context.clock.now()) };

  const [first] = await readInboxMessages(run.context.log, session.inbox.slice(0, 1), {
    times,
    imageBudget: { bytes: 0, count: 0 },
  });

  return (
    first !== undefined && isPastImageBudget(session.images, countImages(first), sessionImageBudget)
  );
}
