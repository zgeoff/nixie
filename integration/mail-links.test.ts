import { expect, onTestFinished, test } from 'bun:test';
import { startTestMail, startTestMailSource, startTestSite } from '@heynixie/mail/test-utils';
import { buildMailPorts } from '@heynixie/server';
import { buildMockToolCall, buildMockToolContext } from '@heynixie/tools/test-utils';
import { formatLinkMark } from '@heynixie/wire';
import { waitFor } from '@zgeoff/testing';
import invariant from 'tiny-invariant';
import { z } from 'zod';
import { buildSandboxHTMLReader } from './test-utils/build-sandbox-html-reader';
import { buildTestWebFetch } from './test-utils/build-test-web-fetch';

async function setupTest() {
  const reader = buildSandboxHTMLReader();

  onTestFinished(() => reader.stop());

  const mail = await startTestMail({ buildPorts: buildMailPorts, reader });

  await startTestMailSource(mail);

  return {
    mail,
    reader,
    readUnreadMailID: async () => {
      const listed = await mail.callTool('mail.list', { unread: true });

      invariant(listed.status === 'ok', 'the mailbox lists its mail');

      const mailSchema = z.object({ message: z.string() });
      const page = z.object({ mails: z.array(mailSchema) }).parse(listed.result);

      return page.mails[0]?.message;
    },
    openLink: (link: string) =>
      buildTestWebFetch(mail).run(
        buildMockToolCall({ tool: 'web_fetch', input: { link } }),
        buildMockToolContext({
          run: { tools: ['web_fetch'], session: { key: 'test-session', invalidatedThrough: 0 } },
        }),
      ),
    waitForWake: () =>
      waitFor(async () => {
        const stored = await mail.callTool('mail.list', { unread: true });

        expect(stored).toMatchObject({ status: 'ok', result: { mails: [expect.anything()] } });
      }),
  };
}

test('it opens the reset link of an HTML mail through the fetch tool, on the site that serves it', async () => {
  const ctx = await setupTest();

  const site = startTestSite({ '/reset': 'Choose a new password.' });
  const resetURL = `${site.origin}/reset?token=t0k3n`;
  const html = `<p>Tap <a href="${resetURL}">Reset password</a>.</p>`;

  ctx.reader.answer(html, {
    kind: 'page',
    url: 'about:blank',
    status: 200,
    contentType: 'text/html',
    text: `Tap Reset password ${formatLinkMark(0)}.`,
    links: [resetURL],
    isTruncated: false,
    blocked: null,
    retryAfterMs: null,
    isGated: false,
  });

  await ctx.mail.callTool('mail.wake_set', { from: ['@library.example.org'], window: '1m' });

  ctx.mail.clock.advance(1000);

  ctx.mail.host.deliver({
    from: 'hello@library.example.org',
    subject: 'Reset your password',
    text: '',
    html,
  });

  ctx.mail.clock.advance(ctx.mail.context.settings.hostPollIntervalMs);

  await ctx.waitForWake();

  const opened = await ctx.mail.callTool('mail.read', { message: await ctx.readUnreadMailID() });
  const fetched = await ctx.openLink('L1');

  expect(opened).toMatchObject({
    status: 'ok',
    result: { text: expect.stringContaining('Reset password [L1 · 127.0.0.1/reset]') },
  });

  expect(fetched).toMatchObject({
    status: 'ok',
    result: { url: resetURL, status: 200, text: 'Choose a new password.' },
  });

  expect(site.requests).toStrictEqual(['/reset?token=t0k3n']);
});

test.each([
  [
    'an address alone on its line that ends in punctuation',
    'Reset here:\r\n{url}!\r\nThanks.',
    '!',
  ],
  ['an address in a sentence', 'Reset here: {url}.', ''],
])('it opens the address of %s with its exact query string', async (_name, template, tail) => {
  const ctx = await setupTest();

  const site = startTestSite({ '/reset': 'Choose a new password.' });
  const resetURL = `${site.origin}/reset?token=abc`;

  await ctx.mail.callTool('mail.wake_set', { from: ['@library.example.org'], window: '1m' });

  ctx.mail.clock.advance(1000);

  ctx.mail.host.deliver({
    from: 'hello@library.example.org',
    subject: 'Reset your password',
    text: template.replace('{url}', resetURL),
  });

  ctx.mail.clock.advance(ctx.mail.context.settings.hostPollIntervalMs);

  await ctx.waitForWake();
  await ctx.mail.callTool('mail.read', { message: await ctx.readUnreadMailID() });

  const fetched = await ctx.openLink('L1');

  expect(fetched).toMatchObject({ status: 'ok', result: { status: 200 } });
  expect(site.requests).toStrictEqual([`/reset?token=abc${tail}`]);
});
