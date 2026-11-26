import { buildSeededTree } from './build-seeded-tree';
import type { FakeMailSeed, StoredMail } from './create-fake-gmail';

// The message that a seed stands for: headers from the seed's fields, and one body part, or an
// alternative of 2, beside a part for each file.
export function buildSeededMail(mail: FakeMailSeed, makeID: () => string): StoredMail {
  const id = mail.id ?? makeID();
  const sentAtMs = mail.sentAtMs ?? Date.parse('2026-11-12T23:04:00Z');

  const headers: (readonly [string, string])[] = [
    ['From', mail.from],
    ['To', (mail.to ?? ['me@example.test']).join(', ')],
    ...(mail.cc === undefined ? [] : [['Cc', mail.cc.join(', ')] as const]),
    ...(mail.replyTo === undefined ? [] : [['Reply-To', mail.replyTo] as const]),
    ['Subject', mail.subject],
    ['Date', new Date(sentAtMs).toUTCString()],
    ['Message-ID', `<${mail.messageID ?? `${id}@mail.test`}>`],
  ];

  return {
    id,
    threadID: mail.threadID ?? id,
    labels: [...(mail.labels ?? ['INBOX', 'UNREAD'])],
    internalDateMs: sentAtMs,
    headers,
    root: buildSeededTree(mail),
  };
}
