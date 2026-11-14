import { match } from 'ts-pattern';
import { isRateLimitReply } from './is-rate-limit-reply';
import type { PassOutcome } from './read-fetch-pass';

// A rewritten URL that a site does not have, that rate-limits, or whose host is paused may still
// have its named page.
export function shouldRetryNamedURL(wasRewritten: boolean, outcome: PassOutcome): boolean {
  if (!wasRewritten) {
    return false;
  }

  return match(outcome)
    .with({ kind: 'paused' }, () => true)
    .with({ kind: 'ended' }, () => false)
    .with(
      { kind: 'reply' },
      (replied) => replied.reply.status === 404 || isRateLimitReply(replied.reply),
    )
    .exhaustive();
}
