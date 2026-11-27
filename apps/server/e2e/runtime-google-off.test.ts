import { expect, onTestFinished, test } from 'bun:test';
import { readFile, writeFile } from 'node:fs/promises';
import {
  connectTestGoogle,
  createTestClient,
  sendClientMessage,
  startE2ENixie,
  startFakeGoogleSite,
} from '@heynixie/server/test-utils';
import { waitFor } from '@zgeoff/testing';

async function setupTest() {
  const google = await startFakeGoogleSite();

  onTestFinished(() => google.stop());

  // a nixie that has no google section, with a fake Google that its tools and polls would reach
  const nixie = await startE2ENixie({
    isGoogleOff: true,
    googleURL: google.url,
    googleAPI: google.api,
  });

  const server = nixie.harness.start();

  const api = await createTestClient(server);

  return { google, nixie, api };
}

test('it offers the model no Gmail, Calendar or Drive tool when the config has no google section', async () => {
  const ctx = await setupTest();

  ctx.nixie.model.addReplies({ text: 'Plum-reply-5GA1' });

  await sendClientMessage(ctx.api.client, { text: 'Quince-message-8HB2' }, 'Plum-reply-5GA1', {
    timeoutMs: 30_000,
  });

  const request = ctx.nixie.model.requests.find((entry) => entry.path === '/v1/messages');
  const tools = request?.body?.tools?.map((tool) => tool.name) ?? [];

  expect({
    hasConversationTool: tools.includes('mcp__nixie__task_start'),
    offered: tools.filter((name) => /gmail|calendar|drive/u.test(name)),
  }).toStrictEqual({ hasConversationTool: true, offered: [] });
});

test('it leaves google out of the features that nixie.read reports', async () => {
  const ctx = await setupTest();
  const read = await ctx.api.client.nixie.read();

  expect(read.features).not.toContain('google');
});

test.each([
  {
    name: 'list',
    call: (api: Awaited<ReturnType<typeof setupTest>>['api']) => api.client.connections.list(),
  },
  {
    name: 'readSetup',
    call: (api: Awaited<ReturnType<typeof setupTest>>['api']) =>
      api.client.connections.readSetup({
        connector: 'google',
        origin: 'https://nixie.example.org',
      }),
  },
])('it answers connections.$name with FEATURE_OFF', async (row) => {
  const ctx = await setupTest();

  expect(row.call(ctx.api)).rejects.toMatchObject({
    code: 'FEATURE_OFF',
    data: { feature: 'google' },
  });
});

test('it sends no request to Gmail once the google section is gone, though a connection is still stored', async () => {
  const google = await startFakeGoogleSite();

  onTestFinished(() => google.stop());

  const nixie = await startE2ENixie({
    googleURL: google.url,
    googleAPI: google.api,
    extraConfig: ['google:', '  gmail:', '    poll_interval: 1m'],
  });

  const first = nixie.harness.start();

  const api = await createTestClient(first);

  await connectTestGoogle(api);

  // the control: while google is on, a poll reaches Gmail
  const before = google.gmail.requests.length;

  await nixie.harness.advance(61_000);

  await waitFor(() => {
    expect(google.gmail.requests.length).toBeGreaterThan(before);
  });

  await first.sendStopSignal();
  await first.waitForExit();

  const config = await readFile(nixie.configPath, 'utf8');

  await writeFile(
    nixie.configPath,
    config.replace('google:\n  gmail:\n    poll_interval: 1m\n', ''),
  );

  const second = nixie.harness.start();

  await second.ready;

  const seen = google.gmail.requests.length;

  await nixie.harness.advance(5 * 61_000);
  await second.sendStopSignal();
  await second.waitForExit();

  expect(google.gmail.requests.length).toBe(seen);
});
