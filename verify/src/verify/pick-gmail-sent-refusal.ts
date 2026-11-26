import type { z } from 'zod';
import type { controlRoutes } from './harness/control-routes';

type SentMail = z.output<typeof controlRoutes.gmailSent.output>['sent'][number];

interface ExpectedSent {
  readonly count: number;

  // the To header that the one mail carries; checked only when exactly one mail is expected
  readonly to?: string | undefined;
}

// A send that went out twice, or not at all, or to the wrong address, shows in the mailbox that the
// fake Gmail kept, which no record of nixie's own can show.
export function pickGmailSentRefusal(
  sent: readonly SentMail[],
  expected: ExpectedSent,
): string | null {
  if (sent.length !== expected.count) {
    return `the fake Gmail took ${sent.length} sent mails, not ${expected.count}`;
  }

  const [only] = sent;

  if (expected.to !== undefined && only?.to.toLowerCase() !== expected.to.toLowerCase()) {
    return `the sent mail went to ${only?.to ?? 'no one'}, not ${expected.to}`;
  }

  return null;
}
