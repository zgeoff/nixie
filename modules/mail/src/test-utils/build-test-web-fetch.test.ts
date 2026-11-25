import { expect, test } from 'bun:test';
import { buildMockToolCall, buildMockToolContext } from '@heynixie/tools/test-utils';
import { buildTestWebFetch } from './build-test-web-fetch';
import { startTestMail } from './start-test-mail';

test('it answers a fetch of a URL with the page the test gave for it', async () => {
  const mail = await startTestMail();

  const tool = buildTestWebFetch(
    mail,
    new Map([['https://library.example.org/reset', 'Choose a new password.']]),
  );

  const outcome = await tool.run(
    buildMockToolCall({ tool: 'web_fetch', input: { url: 'https://library.example.org/reset' } }),
    buildMockToolContext({
      run: { tools: ['web_fetch'], session: { key: 'test-session', invalidatedThrough: 0 } },
    }),
  );

  expect(outcome).toMatchObject({
    status: 'ok',
    result: {
      url: 'https://library.example.org/reset',
      status: 200,
      text: 'Choose a new password.',
    },
  });
});
