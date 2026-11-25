import { expect, test } from 'bun:test';
import { buildGmailSendFields } from './build-gmail-send-fields';

function setupTest() {
  const card = {
    from: 'me@example.test',
    to: 'sam@example.org',
    cc: '',
    bcc: 'lee@example.org',
    subject: 'Q3 numbers',
    files: 'q3.csv (1.0 KiB)',
  };

  return { card };
}

test('it words the card of a send with every recipient, Bcc included', () => {
  const ctx = setupTest();

  expect(buildGmailSendFields('gmail.send', ctx.card)).toStrictEqual({
    status: 'fields',
    fields: {
      from: 'me@example.test',
      to: 'sam@example.org',
      bcc: 'lee@example.org',
      subject: 'Q3 numbers',
      files: 'q3.csv (1.0 KiB)',
    },
    sentence:
      'Send an email from me@example.test to sam@example.org, lee@example.org: "Q3 numbers"',
    approveLabel: 'Send email',
  });
});

test('it words the card of a reply with the message it answers', () => {
  expect(
    buildGmailSendFields('gmail.reply', {
      from: 'me@example.test',
      to: 'sam@example.org',
      replyTo: 'sam@example.org',
      subject: 'Re: Q3 numbers',
      inReplyTo: 'Sam Lee, 12 Nov 2026, "Q3 numbers"',
    }),
  ).toStrictEqual({
    status: 'fields',
    fields: {
      from: 'me@example.test',
      to: 'sam@example.org',
      subject: 'Re: Q3 numbers',
      inReplyTo: 'Sam Lee, 12 Nov 2026, "Q3 numbers"',
    },
    sentence: 'Reply to sam@example.org from me@example.test: "Re: Q3 numbers"',
    approveLabel: 'Send reply',
  });
});

test('it words the card of a sent draft with its whole text', () => {
  const ctx = setupTest();

  expect(
    buildGmailSendFields('gmail.send_draft', {
      ...ctx.card,
      bcc: '',
      text: 'Hi Sam,\nthe numbers.',
    }),
  ).toMatchObject({
    fields: { text: 'Hi Sam,\nthe numbers.' },
    sentence: 'Send a draft from me@example.test to sam@example.org: "Q3 numbers"',
    approveLabel: 'Send email',
  });
});
