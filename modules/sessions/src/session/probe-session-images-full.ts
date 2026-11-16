import { isInboxRecord } from '@heynixie/tasks';
import type { StepInput } from '@heynixie/tasks';
import { isSilentFire } from '../inbox/is-silent-fire';
import { readInboxMessages } from '../inbox/read-inbox-messages';
import type { ConversationRun, ImageTally } from '../types';
import { countImages } from '../utils/count-images';
import { isPastImageBudget } from '../utils/is-past-image-budget';

export interface SessionImages {
  readonly inbox: StepInput['inbox'];
  readonly wake: StepInput['wake'];

  readonly images: ImageTally;
}

export async function probeSessionImagesFull(
  run: Pick<ConversationRun, 'context' | 'defaultZone' | 'messaging' | 'imageBudget'>,
  session: SessionImages,
): Promise<boolean> {
  if (session.images.count === 0) {
    return false;
  }

  const firstVisible = session.inbox.find(
    (record) => isInboxRecord(record) && !isSilentFire(record),
  );

  if (firstVisible === undefined) {
    return false;
  }

  const times = { defaultZone: run.defaultZone, now: new Date(run.context.clock.now()) };

  const read = await readInboxMessages(run.context, [firstVisible], {
    times,
    view: { messaging: run.messaging, wake: session.wake },
    imageBudget: { bytes: 0, count: 0 },
  });

  const [first] = read.messages;

  return (
    first !== undefined && isPastImageBudget(session.images, countImages(first), run.imageBudget)
  );
}
