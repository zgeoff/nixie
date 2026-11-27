import type { MailArrival } from '../types';
import { isWakeMatch } from './is-wake-match';
import type { LiveWakeRule } from './read-live-wake-rules';

// The fields of an arrival that a rule reads: a mail's, or a text's with no subject and no thread.
export type ArrivalFields = Pick<MailArrival, 'from' | 'receivedAt'> &
  Partial<Pick<MailArrival, 'subject' | 'threadID'>> & { readonly body?: string };

// The rules that take an arrival: a rule matches mail that the host received from its creation up
// to its expiry, whenever the source delivers it.
export function collectArrivalMatches(
  rules: readonly LiveWakeRule[],
  arrival: ArrivalFields,
): LiveWakeRule[] {
  const mail = {
    from: arrival.from,
    subject: arrival.subject ?? '',
    threadID: arrival.threadID ?? '',
    ...(arrival.body === undefined ? {} : { body: arrival.body }),
  };

  return rules.filter(
    (entry) =>
      entry.rule.createdAt <= arrival.receivedAt &&
      (entry.rule.expiresAt === null || arrival.receivedAt < entry.rule.expiresAt) &&
      isWakeMatch(entry.rule.match, mail),
  );
}
