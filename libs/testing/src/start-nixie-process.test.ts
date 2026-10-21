import { expect, onTestFinished, test } from 'bun:test';
import { join } from 'node:path';
import { startNixieProcess } from './start-nixie-process';
import { stopProcesses } from './stop-processes';
import { probeProcessGone } from './test-utils/probe-process-gone';
import { waitForCondition } from './wait-for-condition';

function setupTest() {
  return { entry: join(import.meta.dir, 'test-utils/run-stub-nixie.ts') };
}

test('it resolves ready once nixie says it is ready', async () => {
  const ctx = setupTest();
  const nixie = startNixieProcess({ entry: ctx.entry, env: {}, clockMs: 0 });

  onTestFinished(() => nixie.kill());

  await expect(nixie.ready).toResolve();
});

test('it rejects ready with the stderr of a nixie that exits first', async () => {
  const ctx = setupTest();

  const nixie = startNixieProcess({
    entry: ctx.entry,
    env: { STUB_NIXIE_REFUSE: '1' },
    clockMs: 0,
  });

  onTestFinished(() => nixie.kill());

  expect(nixie.ready).rejects.toThrow('nixie exited with code 3: the stub refused to start');

  const exit = await nixie.exited;

  expect(exit).toStrictEqual({ code: 3, signal: null });
});

test('it waits for stderr to close before it names why nixie exited', async () => {
  const ctx = setupTest();

  const nixie = startNixieProcess({
    entry: ctx.entry,
    env: { STUB_NIXIE_REFUSE: '1', STUB_NIXIE_LATE_STDERR: '1' },
    clockMs: 0,
  });

  onTestFinished(() => nixie.kill());

  expect(nixie.ready).rejects.toThrow(
    'nixie exited with code 3: the stub refused to start\nthe last words\n',
  );

  await nixie.exited;
});

test('it starts nixie on the clock time it is given', async () => {
  const ctx = setupTest();
  const nixie = startNixieProcess({ entry: ctx.entry, env: {}, clockMs: 1_000_000 });

  onTestFinished(() => nixie.kill());

  await nixie.ready;

  const now = await nixie.request('now', null);

  expect(now).toBe(1_000_000);
});

test('it reports an arrival at an armed fault point and lets the runner go on release', async () => {
  const ctx = setupTest();

  const nixie = startNixieProcess({
    entry: ctx.entry,
    env: {},
    clockMs: 0,
    faultPoints: [{ point: 'stub.point' }],
  });

  onTestFinished(() => nixie.kill());

  await nixie.ready;

  const held = nixie.request('hold', 'work-1');

  const arrival = await nixie.waitForArrival('stub.point', 'work-1');

  nixie.release(arrival);

  expect(arrival).toStrictEqual({
    arrivalID: 1,
    point: 'stub.point',
    work: { kind: 'stub', id: 'work-1' },
  });

  const result = await held;

  expect(result).toBe('released');
});

test('it kills nixie and every process nixie started', async () => {
  const ctx = setupTest();
  const nixie = startNixieProcess({ entry: ctx.entry, env: {}, clockMs: 0 });

  onTestFinished(() => nixie.kill());

  await nixie.ready;

  const started = await nixie.request('startChild', null);

  const childPID = Number(started);

  onTestFinished(() => {
    stopProcesses([childPID]);
  });

  const exit = await nixie.kill();

  expect(exit).toStrictEqual({ code: null, signal: 'SIGKILL' });

  await expect(waitForCondition(() => probeProcessGone(childPID))).toResolve();
});

// Signal 34 is a real-time signal, which has no name, so Bun reports it as a number.
test('it reports a nixie that a signal with no name ended with the signal as its number', async () => {
  const ctx = setupTest();
  const nixie = startNixieProcess({ entry: ctx.entry, env: {}, clockMs: 0 });

  onTestFinished(() => nixie.kill());

  await nixie.ready;

  Bun.spawnSync(['kill', '-34', String(nixie.pid)]);

  const exit = await nixie.exited;

  expect(exit).toStrictEqual({ code: null, signal: '34' });
});

test('it rejects a request that a kill cut short', async () => {
  const ctx = setupTest();

  const nixie = startNixieProcess({
    entry: ctx.entry,
    env: {},
    clockMs: 0,
    faultPoints: [{ point: 'stub.point' }],
  });

  onTestFinished(() => nixie.kill());

  await nixie.ready;

  const held = nixie.request('hold', 'work-1');

  await nixie.waitForArrival('stub.point');
  await nixie.kill();

  expect(held).rejects.toThrow('nixie exited with signal SIGKILL');
});
