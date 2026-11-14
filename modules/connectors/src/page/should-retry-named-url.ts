import type { PassOutcome } from '../utils/read-fetch-pass';
import { isRateLimitReply } from './is-rate-limit-reply';

// A rewritten URL that a site does not have, or that rate-limits, may still have its named page.
export function shouldRetryNamedURL(wasRewritten: boolean, outcome: PassOutcome): boolean {
  return (
    wasRewritten &&
    outcome.kind === 'reply' &&
    (outcome.reply.status === 404 || isRateLimitReply(outcome.reply))
  );
}
