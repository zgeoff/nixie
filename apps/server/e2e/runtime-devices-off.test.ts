import { expect, test } from 'bun:test';
import { join } from 'node:path';
import {
  createTestClient,
  runHostCommand,
  sendClientMessage,
  startE2ENixie,
} from '@heynixie/server/test-utils';

async function setupTest() {
  // a config with no devices section, so the devices feature is off
  const nixie = await startE2ENixie({ isDevicesOff: true });

  const server = nixie.harness.start();

  const api = await createTestClient(server);

  return { nixie, api };
}

test('it offers the model no device tool when the config has no devices section', async () => {
  const ctx = await setupTest();

  ctx.nixie.model.addReplies({ text: 'Plum-reply-6DV2' });

  await sendClientMessage(ctx.api.client, { text: 'Quince-message-1HT9' }, 'Plum-reply-6DV2', {
    timeoutMs: 30_000,
  });

  const request = ctx.nixie.model.requests.find((entry) => entry.path === '/v1/messages');
  const tools = request?.body?.tools?.map((tool) => tool.name) ?? [];

  expect({
    hasConversationTool: tools.includes('mcp__nixie__task_start'),
    offered: tools.filter((name) => /device_/u.test(name)),
  }).toStrictEqual({ hasConversationTool: true, offered: [] });
});

test('it leaves devices out of the features that nixie.read reports', async () => {
  const ctx = await setupTest();
  const read = await ctx.api.client.nixie.read();

  expect(read.features).not.toContain('devices');
});

test('it answers a procedure of the devices with FEATURE_OFF', async () => {
  const ctx = await setupTest();

  const registered = ctx.api.client.devices.register({
    clientActionID: crypto.randomUUID(),
    name: 'kitchen tab',
  });

  expect(registered).rejects.toMatchObject({ code: 'FEATURE_OFF', data: { feature: 'devices' } });
});

test('it refuses a code for a device session', async () => {
  const ctx = await setupTest();

  const issued = ctx.api.client.sessions.issueCode({
    clientActionID: crypto.randomUUID(),
    scope: 'device',
  });

  expect(issued).rejects.toMatchObject({ code: 'FEATURE_OFF', data: { feature: 'devices' } });
});

test('it serves no page frame route, so a frame request falls through to the API checks', async () => {
  const ctx = await setupTest();

  // a nixie with devices on answers a frame path with its own 404, before the client header check
  const response = await fetch(`${ctx.api.url}/rpc/device/frames/plum-ticket`);

  expect(response.status).toBe(403);
});

test('it needs no render image when the config has no devices section, because no render part is planned', async () => {
  const ctx = await setupTest();

  const run = await runHostCommand(ctx.nixie.configPath, [
    'sandbox-manifest',
    '--needed',
    '--manifest',
    join(ctx.nixie.directory, 'sandbox-manifest.json'),
  ]);

  expect({ exitCode: run.exitCode, keys: Object.keys(JSON.parse(run.stdout)) }).toStrictEqual({
    exitCode: 0,
    keys: expect.not.arrayContaining(['render']),
  });
});

test('it needs the render image when the config has a devices section, so the check above can fail', async () => {
  const nixie = await startE2ENixie({});

  const run = await runHostCommand(nixie.configPath, [
    'sandbox-manifest',
    '--needed',
    '--manifest',
    join(nixie.directory, 'sandbox-manifest.json'),
  ]);

  expect(Object.keys(JSON.parse(run.stdout))).toContain('render');
});
