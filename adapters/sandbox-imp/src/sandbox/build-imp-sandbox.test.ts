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
import { startFakeImp } from '../test-utils/start-fake-imp';
import { startSharedImpd } from '../test-utils/start-impd';
import { buildImpSandboxAdapter } from './build-imp-sandbox-adapter';

async function setupTest() {
  const started = await startSharedImpd();
  const recorder = await setupTestRecorder();
  const imp = await startFakeImp(started);
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

  return { imp, adapter, recorder, readCalls: started.readCalls };
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
      'const get = () => fetch(process.env.TOOL_URL + "/mcp", { headers: { authorization: "Bearer run-token" } }); const r = await get().catch(async () => { await Bun.sleep(200); return get(); }); console.log(await r.text())',
    ],
    env: { TOOL_URL: route.url },
  });

  await waitForCondition(() => ctx.imp.events.some((event) => event.startsWith('wait ')));

  snapshot.resolve();

  const result = await turn;

  expect(new TextDecoder().decode(result.stderr.bytes)).toBe('');

  expect(JSON.parse(new TextDecoder().decode(result.stdout.bytes))).toStrictEqual({
    path: '/mcp',
    authorization: 'Bearer run-token',
  });

  expect(ctx.imp.events).toStrictEqual([`wait wake ${sandbox.id}`]);

  expect(ctx.readCalls().map((call) => [call.procedure, call.input])).toIncludeAllMembers([
    ['imps/sleep', { name: sandbox.id }],
    ['imps/wake', { name: sandbox.id, restartError: false }],
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

  await waitForCondition(() => ctx.imp.events.includes(`wait exec ${sandbox.id}`));

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
  expect(ctx.readCalls().map((call) => call.procedure)).toContain('imps/wake');
  expect(ctx.imp.memoryKillReads).toStrictEqual([sandbox.id]);

  const records = await ctx.recorder.readSandboxRecords();

  expect(records).toContainEqual(expect.objectContaining({ kind: 'sandbox.woken' }));
});

test('it fails the memory kill read of an aborted signal and starts no exec', async () => {
  const ctx = await setupTest();
  const sandbox = await ctx.adapter.create(buildMockSandboxSpec());

  expect(sandbox.readMemoryKills(AbortSignal.abort())).resolves.toStrictEqual({ kind: 'failed' });
  expect(ctx.imp.execs).toStrictEqual([]);
  expect(ctx.imp.memoryKillReads).toStrictEqual([]);
});

test('it fails the memory kill read on an abort while an idle sleep holds the exec', async () => {
  const ctx = await setupTest();
  const sandbox = await ctx.adapter.create(buildMockSandboxSpec());

  const snapshot = Promise.withResolvers<void>();

  const controller = new AbortController();

  void ctx.imp.startIdleSleep(sandbox.id, snapshot.promise);
  const read = sandbox.readMemoryKills(controller.signal);

  await waitForCondition(() => ctx.imp.events.some((event) => event.startsWith('wait ')));

  controller.abort();

  const result = await read;

  expect(result).toStrictEqual({ kind: 'failed' });
  expect(ctx.imp.events).not.toContain(`woken by exec ${sandbox.id}`);

  snapshot.resolve();
});
