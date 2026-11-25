import { expect, test } from 'bun:test';
import { buildOutgoingMail } from './build-outgoing-mail';
import { parseMail } from './parse-mail';

function setupTest() {
  const references: string[] = [];

  return {
    draft: {
      messageID: 'act1@nixie.example.org',
      from: 'assistant@nixie.example.org',
      to: ['hello@library.example.org'],
      subject: 'A question',
      text: 'Could you extend my loan by a week?',
      references,
      sentAt: Date.parse('2027-03-09T00:00:00Z'),
    },
  };
}

test('#buildOutgoingMail builds a message that reads back as it was written', () => {
  const ctx = setupTest();
  const parsed = parseMail(buildOutgoingMail(ctx.draft).raw);

  expect(parsed).toStrictEqual({
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

  const parsed = parseMail(
    buildOutgoingMail({ ...ctx.draft, references: ['b@x.example.org', 'a@x.example.org'] }).raw,
  );

  expect(parsed.references).toStrictEqual([
    'b@x.example.org',
    'b@x.example.org',
    'a@x.example.org',
  ]);
});

test('#buildOutgoingMail keeps a subject and a text with non-ASCII characters', () => {
  const ctx = setupTest();

  const parsed = parseMail(
    buildOutgoingMail({ ...ctx.draft, subject: 'Café plans', text: 'See you at the café.' }).raw,
  );

  expect([parsed.subject, parsed.text]).toStrictEqual(['Café plans', 'See you at the café.']);
});
