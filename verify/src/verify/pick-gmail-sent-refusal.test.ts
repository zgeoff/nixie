import { expect, test } from 'bun:test';
import { pickGmailSentRefusal } from './pick-gmail-sent-refusal';

test('#pickGmailSentRefusal accepts one mail to the expected address', () => {
  expect(
    pickGmailSentRefusal([{ to: 'reports@example.org', messageID: '<a@example.test>' }], {
      count: 1,
      to: 'Reports@example.org',
    }),
  ).toBeNull();
});

test.each([
  { title: 'no mail', sent: [], expected: 'the fake Gmail took 0 sent mails, not 1' },
  {
    title: 'a double send',
    sent: [
      { to: 'reports@example.org', messageID: '<a@example.test>' },
      { to: 'reports@example.org', messageID: '<b@example.test>' },
    ],
    expected: 'the fake Gmail took 2 sent mails, not 1',
  },
  {
    title: 'a mail to another address',
    sent: [{ to: 'sam@example.org', messageID: '<a@example.test>' }],
    expected: 'the sent mail went to sam@example.org, not reports@example.org',
  },
])('#pickGmailSentRefusal refuses $title', (row) => {
  expect(pickGmailSentRefusal(row.sent, { count: 1, to: 'reports@example.org' })).toBe(
    row.expected,
  );
});
