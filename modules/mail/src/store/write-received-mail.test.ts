import { expect, test } from 'bun:test';
import { parseMail } from '../parse/parse-mail';
import { seedReceivedMail, startTestMail } from '../test-utils';
import { readMailPage } from './read-mail-page';
import { writeReceivedMail } from './write-received-mail';

test('#writeReceivedMail puts a mail that answers an earlier one in the thread of the earlier one', async () => {
  const mail = await startTestMail();

  const first = await seedReceivedMail(mail, {
    from: 'hello@library.example.org',
    subject: 'Your loan',
    text: 'Due.',
    messageID: 'a@library.example.org',
  });

  const second = await seedReceivedMail(mail, {
    from: 'hello@library.example.org',
    subject: 'Re: Your loan',
    text: 'Still due.',
    messageID: 'b@library.example.org',
    references: ['a@library.example.org'],
  });

  expect(second.threadShortID).toBe(first.threadShortID);
});

test('#writeReceivedMail starts a thread of its own for a mail that answers nothing stored', async () => {
  const mail = await startTestMail();

  const first = await seedReceivedMail(mail, {
    from: 'hello@library.example.org',
    subject: 'Your loan',
    text: 'Due.',
    messageID: 'a@library.example.org',
  });

  const second = await seedReceivedMail(mail, {
    from: 'news@school.example.org',
    subject: 'Term dates',
    text: 'Soon.',
    messageID: 'c@school.example.org',
  });

  expect(second.threadShortID).not.toBe(first.threadShortID);
});

test('#writeReceivedMail stores a host mail once, however often it is delivered', async () => {
  const mail = await startTestMail();

  const hostMail = mail.host.deliver({
    from: 'hello@library.example.org',
    subject: 'Your code',
    text: 'Code 482913.',
  });

  const first = await writeReceivedMail(mail.context, hostMail, parseMail(hostMail.raw));
  const second = await writeReceivedMail(mail.context, hostMail, parseMail(hostMail.raw));
  const page = await readMailPage(mail.context, { limit: 10 });

  expect(second).toStrictEqual(first);
  expect(page.mails).toHaveLength(1);
});
