import type { MailArrival } from '../types';
import { isWakeMatch } from './is-wake-match';
import type { LiveWakeRule } from './read-live-wake-rules';

// The rules that take an arrival: a rule matches mail that the host received from its creation up
// to its expiry, whenever the source delivers it.
export function collectArrivalMatches(
  rules: readonly LiveWakeRule[],
  arrival: MailArrival,
): LiveWakeRule[] {
  const mail = { from: arrival.from, subject: arrival.subject, threadID: arrival.threadID };

  return rules.filter(
    (entry) =>
      entry.rule.createdAt <= arrival.receivedAt &&
      (entry.rule.expiresAt === null || arrival.receivedAt < entry.rule.expiresAt) &&
      isWakeMatch(entry.rule.match, mail),
  );
}
