import { expect, test } from 'bun:test';
import { createTestClient, startE2ENixie } from '@heynixie/server/test-utils';
import { z } from 'zod';

async function setupTest() {
  // a config with no voice section, so calls are off
  const nixie = await startE2ENixie({ isVoiceOff: true });

  const server = nixie.harness.start();

  const api = await createTestClient(server);

  return { nixie, api, server };
}

test('it registers no call tool when the config has no voice section', async () => {
  const ctx = await setupTest();
  const reply = await ctx.server.request('readRegisteredTools', null);

  const names = z.array(z.string()).parse(reply);

  expect({
    hasConversationTool: names.includes('task.start'),
    hasHangUp: names.includes('call.hang_up'),
  }).toStrictEqual({ hasConversationTool: true, hasHangUp: false });
});

test('it registers the hang-up tool when the config has a voice section, so the check above can fail', async () => {
  const nixie = await startE2ENixie({});

  const server = nixie.harness.start();

  await server.ready;

  const reply = await server.request('readRegisteredTools', null);

  const names = z.array(z.string()).parse(reply);

  expect(names).toContain('call.hang_up');
});

test('it leaves voice out of the features that nixie.read reports', async () => {
  const ctx = await setupTest();
  const read = await ctx.api.client.nixie.read();

  expect(read.features).not.toContain('voice');
});

test('it answers a procedure of the calls with FEATURE_OFF', async () => {
  const ctx = await setupTest();

  const started = ctx.api.client.calls.start({ clientActionID: crypto.randomUUID() });

  expect(started).rejects.toMatchObject({ code: 'FEATURE_OFF', data: { feature: 'voice' } });
});

test('it starts no calls part, so the test build can place no call', async () => {
  const ctx = await setupTest();

  const placed = ctx.server.request('placeHarnessCall', null);

  expect(placed).rejects.toThrow(/holds no calls/u);
});
