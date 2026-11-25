import { expect, test } from 'bun:test';
import invariant from 'tiny-invariant';
import type { OutgoingDraft } from './build-outgoing-mail';
import { buildOutgoingMail } from './build-outgoing-mail';
import { parseMail } from './parse-mail';

function setupTest() {
  const references: string[] = [];

  const draft: OutgoingDraft = {
    messageID: 'act1@nixie.example.org',
    from: 'assistant@nixie.example.org',
    to: ['hello@library.example.org'],
    subject: 'A question',
    text: 'Could you extend my loan by a week?',
    references,
    sentAt: Date.parse('2027-03-09T00:00:00Z'),
  };

  return {
    draft,
    build: (overrides: Partial<OutgoingDraft>) => {
      const mail = buildOutgoingMail({ ...draft, ...overrides });

      invariant(mail !== null, 'the draft is valid');

      return parseMail(mail.raw);
    },
  };
}

test('#buildOutgoingMail builds a message that reads back as it was written', () => {
  const ctx = setupTest();

  expect(ctx.build({})).toStrictEqual({
    messageID: 'act1@nixie.example.org',
    references: [],
    from: 'assistant@nixie.example.org',
    to: ['hello@library.example.org'],
    cc: [],
    subject: 'A question',
    text: 'Could you extend my loan by a week?',
    attachments: [],
  });
});

test('#buildOutgoingMail chains a reply to the mails it answers', () => {
  const ctx = setupTest();
  const parsed = ctx.build({ references: ['b@x.example.org', 'a@x.example.org'] });

  expect(parsed.references).toStrictEqual([
    'b@x.example.org',
    'b@x.example.org',
    'a@x.example.org',
  ]);
});

test('#buildOutgoingMail keeps a subject and a text with non-ASCII characters', () => {
  const ctx = setupTest();
  const parsed = ctx.build({ subject: 'Café plans', text: 'See you at the café.' });

  expect([parsed.subject, parsed.text]).toStrictEqual(['Café plans', 'See you at the café.']);
});

test.each([
  ['a recipient with a letter past Latin-1', { to: ['helloŁ@library.example.org'] }],
  ['a recipient that latin1 turns into a line break', { to: ['aĊ@library.example.org'] }],
  ['a recipient with a control character', { to: ['a\u0001b@library.example.org'] }],
  [
    'a recipient with a line break and a header',
    { to: ['a@x.example.org\r\nBcc: b@x.example.org'] },
  ],
  ['a recipient that is a display name and an address', { to: ['Sam <sam@x.example.org>'] }],
  ['a recipient with a non-ASCII domain', { to: ['sam@bibliothèque.example.org'] }],
  ['no recipient', { to: [] }],
  ['a reference with a line break', { references: ['a@x.example.org\r\nBcc: b@x.example.org'] }],
  ['a reference with a letter past Latin-1', { references: ['aĊ@x.example.org'] }],
  ['a Message-ID with a space', { messageID: 'act 1@nixie.example.org' }],
])('#buildOutgoingMail refuses %s', (_title, overrides) => {
  const ctx = setupTest();

  expect(buildOutgoingMail({ ...ctx.draft, ...overrides })).toBeNull();
});
