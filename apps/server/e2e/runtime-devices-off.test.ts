import { expect, test } from 'bun:test';
import { join } from 'node:path';
import { createTestClient, runHostCommand, startE2ENixie } from '@heynixie/server/test-utils';
import invariant from 'tiny-invariant';
import { z } from 'zod';

async function setupTest() {
  // a config with no devices section, so the devices feature is off
  const nixie = await startE2ENixie({ isDevicesOff: true });

  const server = nixie.harness.start();

  const api = await createTestClient(server);

  return { nixie, api, server };
}

test('it registers no device tool when the config has no devices section', async () => {
  const ctx = await setupTest();
  const reply = await ctx.server.request('readRegisteredTools', null);

  const names = z.array(z.string()).parse(reply);

  expect({
    hasConversationTool: names.includes('task.start'),
    deviceTools: names.filter((name) => /^devices?\./u.test(name)),
  }).toStrictEqual({ hasConversationTool: true, deviceTools: [] });
});

test('it registers the device tools when the config has a devices section, so the check above can fail', async () => {
  const nixie = await startE2ENixie({});

  const server = nixie.harness.start();

  await server.ready;

  const reply = await server.request('readRegisteredTools', null);

  const names = z.array(z.string()).parse(reply);

  expect(names.filter((name) => /^devices?\./u.test(name))).toIncludeAllMembers([
    'devices.list',
    'devices.watch',
  ]);
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

  const manifest: unknown = JSON.parse(run.stdout);

  invariant(typeof manifest === 'object' && manifest !== null, 'the manifest is an object');

  expect({
    exitCode: run.exitCode,
    hasRender: Object.keys(manifest).includes('render'),
  }).toStrictEqual({ exitCode: 0, hasRender: false });
});

test('it needs the render image when the config has a devices section, so the check above can fail', async () => {
  const nixie = await startE2ENixie({});

  const run = await runHostCommand(nixie.configPath, [
    'sandbox-manifest',
    '--needed',
    '--manifest',
    join(nixie.directory, 'sandbox-manifest.json'),
  ]);

  const manifest: unknown = JSON.parse(run.stdout);

  invariant(typeof manifest === 'object' && manifest !== null, 'the manifest is an object');

  expect(Object.keys(manifest)).toContain('render');
});
