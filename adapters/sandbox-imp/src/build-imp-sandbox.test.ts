import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  buildMockSandboxSpec,
  setupTestRecorder,
  startStubToolEndpoint,
} from '@heynixie/sandbox/test-utils';
import { waitForCondition } from '@heynixie/testing';
import invariant from 'tiny-invariant';
import { buildImpSandboxAdapter } from './build-imp-sandbox-adapter';
import { startFakeImp } from './test-utils/start-fake-imp';

async function setupTest() {
  const recorder = await setupTestRecorder();
  const imp = await startFakeImp();
  const directory = await mkdtemp(join(tmpdir(), 'nixie-sandbox-imp-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));
  startStubToolEndpoint(join(directory, 'tools.sock'));

  const adapter = buildImpSandboxAdapter({
    port: imp.port,
    recorder: recorder.recorder,
    config: { publicEgress: null },
    toolTarget: () => ({ path: join(directory, 'tools.sock') }),
    guestToolPort: imp.guestToolPort,
  });

  return { imp, adapter };
}

test('it lets a turn that starts during an idle sleep reach the tool endpoint on the woken imp', async () => {
  const ctx = await setupTest();
  const sandbox = await ctx.adapter.create(buildMockSandboxSpec({ toolRoute: true }));
  const route = await sandbox.toolRoute();

  invariant(route);

  const snapshot = Promise.withResolvers<void>();

  void ctx.imp.startIdleSleep(sandbox.id, snapshot.promise);

  const turn = sandbox.exec({
    argv: [
      process.execPath,
      '-e',
      'const r = await fetch(process.env.TOOL_URL + "/mcp", { headers: { authorization: "Bearer run-token" } }); console.log(await r.text())',
    ],
    env: { TOOL_URL: route.url },
  });

  await waitForCondition(() => ctx.imp.calls.some((call) => call.startsWith('wait ')));

  snapshot.resolve();

  const result = await turn;

  expect(new TextDecoder().decode(result.stderr.bytes)).toBe('');

  expect(JSON.parse(new TextDecoder().decode(result.stdout.bytes))).toStrictEqual({
    path: '/mcp',
    authorization: 'Bearer run-token',
  });

  expect(ctx.imp.calls.slice(ctx.imp.calls.indexOf(`slept ${sandbox.id}`))).toStrictEqual([
    `slept ${sandbox.id}`,
    `woken by wake ${sandbox.id}`,
    `wake ${sandbox.id}`,
    `forward ${sandbox.id} ${ctx.imp.guestToolPort}`,
  ]);
});

test('it lets a turn reach the tool endpoint when an idle sleep starts between its wake and its exec', async () => {
  const ctx = await setupTest();
  const sandbox = await ctx.adapter.create(buildMockSandboxSpec({ toolRoute: true }));
  const route = await sandbox.toolRoute();

  invariant(route);

  const snapshot = Promise.withResolvers<void>();

  ctx.imp.sleepsAfterWake.set(sandbox.id, snapshot.promise);

  const turn = sandbox.exec({
    argv: [
      process.execPath,
      '-e',
      'const get = () => fetch(process.env.TOOL_URL + "/mcp", { headers: { authorization: "Bearer run-token" } }); const r = await get().catch(async () => { await Bun.sleep(200); return get(); }); console.log(await r.text())',
    ],
    env: { TOOL_URL: route.url },
  });

  await waitForCondition(() => ctx.imp.calls.includes(`wait exec ${sandbox.id}`));

  snapshot.resolve();

  const result = await turn;

  expect(new TextDecoder().decode(result.stderr.bytes)).toBe('');

  expect(JSON.parse(new TextDecoder().decode(result.stdout.bytes))).toStrictEqual({
    path: '/mcp',
    authorization: 'Bearer run-token',
  });
});
