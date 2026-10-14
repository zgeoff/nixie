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

// A conversation sandbox on a fake impd, created with its tool route open as a turn before left it.
// The stub tool endpoint listens on a unix socket in a scratch directory.
async function setupTest() {
  const recorder = await setupTestRecorder();
  const imp = await startFakeImp();
  const dir = await mkdtemp(join(tmpdir(), 'nixie-sandbox-imp-'));

  onTestFinished(() => rm(dir, { recursive: true, force: true }));
  startStubToolEndpoint(join(dir, 'tools.sock'));

  const adapter = buildImpSandboxAdapter({
    port: imp.port,
    recorder: recorder.recorder,
    config: { publicEgress: null },
    toolTarget: () => ({ path: join(dir, 'tools.sock') }),
    guestToolPort: imp.guestToolPort,
  });
  const sandbox = await adapter.create(buildMockSandboxSpec({ toolRoute: true }));
  const route = await sandbox.toolRoute();

  invariant(route);
  return { imp, sandbox, toolURL: route.url };
}

test('it lets a turn that starts during an idle sleep reach the tool endpoint on the woken imp', async () => {
  const ctx = await setupTest();
  const snapshot = Promise.withResolvers<void>();

  void ctx.imp.startIdleSleep(ctx.sandbox.id, snapshot.promise);

  // the guest's tool check, which connects at once
  const turn = ctx.sandbox.exec({
    argv: [
      process.execPath,
      '-e',
      'const r = await fetch(process.env.TOOL_URL + "/mcp", { headers: { authorization: "Bearer run-token" } }); console.log(await r.text())',
    ],
    env: { TOOL_URL: ctx.toolURL },
  });

  // the turn's first call to impd waits for the sleep
  await waitForCondition(() => ctx.imp.calls.some((call) => call.startsWith('wait ')));
  snapshot.resolve();

  const result = await turn;

  expect(new TextDecoder().decode(result.stderr.bytes)).toBe('');
  expect(JSON.parse(new TextDecoder().decode(result.stdout.bytes))).toStrictEqual({
    path: '/mcp',
    authorization: 'Bearer run-token',
  });

  // the forward listens on the woken imp before the exec starts there
  expect(ctx.imp.calls.slice(ctx.imp.calls.indexOf(`slept ${ctx.sandbox.id}`))).toStrictEqual([
    `slept ${ctx.sandbox.id}`,
    `woken by wake ${ctx.sandbox.id}`,
    `wake ${ctx.sandbox.id}`,
    `forward ${ctx.sandbox.id} ${ctx.imp.guestToolPort}`,
  ]);
});

test('it lets a turn reach the tool endpoint when an idle sleep starts between its wake and its exec', async () => {
  const ctx = await setupTest();
  const snapshot = Promise.withResolvers<void>();

  ctx.imp.sleepsAfterWake.set(ctx.sandbox.id, snapshot.promise);

  // the guest's tool check, which connects again once after a pause, as checkToolServer does
  const turn = ctx.sandbox.exec({
    argv: [
      process.execPath,
      '-e',
      'const get = () => fetch(process.env.TOOL_URL + "/mcp", { headers: { authorization: "Bearer run-token" } }); const r = await get().catch(async () => { await Bun.sleep(200); return get(); }); console.log(await r.text())',
    ],
    env: { TOOL_URL: ctx.toolURL },
  });

  await waitForCondition(() => ctx.imp.calls.includes(`wait exec ${ctx.sandbox.id}`));
  snapshot.resolve();

  const result = await turn;

  expect(new TextDecoder().decode(result.stderr.bytes)).toBe('');
  expect(JSON.parse(new TextDecoder().decode(result.stdout.bytes))).toStrictEqual({
    path: '/mcp',
    authorization: 'Bearer run-token',
  });
});
