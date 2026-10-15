import type { StepInput } from '@heynixie/tasks';
import { countImageBytes } from './count-image-bytes';
import { readInboxMessages } from './read-inbox-messages';
import { sessionImageBudgetBytes } from './session-image-budget-bytes';
import type { ConversationRun } from './types';

export interface SessionImages {
  readonly inbox: StepInput['inbox'];

  // the image bytes, in base64, the session holds after its last turn
  readonly imageBytes: number;
}

// Whether the images the session holds leave no room for those of the inbox's first message, which
// a turn always takes, so the session must open again. A message with no images always fits.
export async function isSessionImagesFull(
  run: Pick<ConversationRun, 'context' | 'defaultZone'>,
  session: SessionImages,
): Promise<boolean> {
  if (session.imageBytes === 0) {
    return false;
  }

  const times = { defaultZone: run.defaultZone, now: new Date(run.context.clock.now()) };

  const [first] = await readInboxMessages(run.context.log, session.inbox.slice(0, 1), {
    times,
    imageBudgetBytes: 0,
  });

  const bytes = first === undefined ? 0 : countImageBytes(first);

  return bytes > 0 && session.imageBytes + bytes > sessionImageBudgetBytes;
}
