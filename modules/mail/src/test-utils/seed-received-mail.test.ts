import { expect, test } from 'bun:test';
import { readMailPage } from '../store/read-mail-page';
import { seedReceivedMail } from './seed-received-mail';
import { startTestMail } from './start-test-mail';

test('it stores a mail that the page of the inbox reads back', async () => {
  const mail = await startTestMail();

  const received = await seedReceivedMail(mail, {
    from: 'hello@library.example.org',
    subject: 'Your loan',
    text: 'Your loan is due.',
  });

  const page = await readMailPage(mail.context, { limit: 10 });

  expect(page.mails.map((entry) => [entry.message, entry.from, entry.subject])).toStrictEqual([
    [received.shortID, 'hello@library.example.org', 'Your loan'],
  ]);
});
