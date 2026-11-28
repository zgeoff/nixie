import { buildMessage } from './build-message';
import type { Settled } from './types';

// What the model reads when the user declined this same action earlier in the task run.
export function buildDeclinedMessage(shortID: string): Settled {
  return buildMessage(
    'denied',
    `denied: the user declined this same action earlier in this run (\`${shortID}\`), so it asks nothing more. Do not propose it again.`,
  );
}
