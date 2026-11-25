import { expect, test } from 'bun:test';
import { buildMockToolCall, buildMockToolContext } from '@heynixie/tools/test-utils';
import { buildTestWebFetch } from './build-test-web-fetch';
import { startTestMail } from './start-test-mail';
import { startTestSite } from './start-test-site';

test('it answers a fetch of a URL with the page that the test site serves for it', async () => {
  const mail = await startTestMail();

  const site = startTestSite({ '/reset': 'Choose a new password.' });
  const tool = buildTestWebFetch(mail);

  const outcome = await tool.run(
    buildMockToolCall({ tool: 'web_fetch', input: { url: `${site.origin}/reset` } }),
    buildMockToolContext({
      run: { tools: ['web_fetch'], session: { key: 'test-session', invalidatedThrough: 0 } },
    }),
  );

  expect(outcome).toMatchObject({
    status: 'ok',
    result: { url: `${site.origin}/reset`, status: 200, text: 'Choose a new password.' },
  });
});
