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

  return { imp, adapter, recorder };
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

test('it reads the count of memory kills the guest holds', async () => {
  const ctx = await setupTest();
  const sandbox = await ctx.adapter.create(buildMockSandboxSpec());

  ctx.imp.memoryKills = 3;

  expect(sandbox.readMemoryKills()).resolves.toStrictEqual({ kind: 'count', kills: 3 });
});

test('it reads a count of 0 from a guest that was never killed for memory', async () => {
  const ctx = await setupTest();
  const sandbox = await ctx.adapter.create(buildMockSandboxSpec());

  expect(sandbox.readMemoryKills()).resolves.toStrictEqual({ kind: 'count', kills: 0 });
});

test('it reads no count from a guest with no memory.events file', async () => {
  const ctx = await setupTest();
  const sandbox = await ctx.adapter.create(buildMockSandboxSpec());

  ctx.imp.memoryKills = 'missing';

  expect(sandbox.readMemoryKills()).resolves.toStrictEqual({ kind: 'unsupported' });
});

test('it fails the memory kill read when the connection drops', async () => {
  const ctx = await setupTest();
  const sandbox = await ctx.adapter.create(buildMockSandboxSpec());

  ctx.imp.memoryKills = 'lost';

  expect(sandbox.readMemoryKills()).resolves.toStrictEqual({ kind: 'failed' });
});

test('it wakes a sleeping imp for the memory kill read and records the wake', async () => {
  const ctx = await setupTest();
  const sandbox = await ctx.adapter.create(buildMockSandboxSpec());

  ctx.imp.memoryKills = 2;

  invariant(sandbox.suspension.kind === 'memory');

  await sandbox.suspension.sleep();

  const read = await sandbox.readMemoryKills();

  expect(read).toStrictEqual({ kind: 'count', kills: 2 });

  expect(ctx.imp.calls).toIncludeAllMembers([
    `wake ${ctx.imp.created[0]?.name}`,
    `memory-kills ${ctx.imp.created[0]?.name}`,
  ]);

  const records = await ctx.recorder.readSandboxRecords();

  expect(records).toContainEqual(expect.objectContaining({ kind: 'sandbox.woken' }));
});

test('it fails the memory kill read of an aborted signal and starts no exec', async () => {
  const ctx = await setupTest();
  const sandbox = await ctx.adapter.create(buildMockSandboxSpec());

  expect(sandbox.readMemoryKills(AbortSignal.abort())).resolves.toStrictEqual({ kind: 'failed' });
  expect(ctx.imp.execs).toStrictEqual([]);
  expect(ctx.imp.calls.filter((call) => call.startsWith('memory-kills'))).toStrictEqual([]);
});

test('it fails the memory kill read on an abort while an idle sleep holds the exec', async () => {
  const ctx = await setupTest();
  const sandbox = await ctx.adapter.create(buildMockSandboxSpec());

  const snapshot = Promise.withResolvers<void>();

  const controller = new AbortController();

  void ctx.imp.startIdleSleep(sandbox.id, snapshot.promise);
  const read = sandbox.readMemoryKills(controller.signal);

  await waitForCondition(() => ctx.imp.calls.some((call) => call.startsWith('wait ')));

  controller.abort();

  const result = await read;

  expect(result).toStrictEqual({ kind: 'failed' });
  expect(ctx.imp.calls).not.toContain(`woken by exec ${sandbox.id}`);

  snapshot.resolve();
});
