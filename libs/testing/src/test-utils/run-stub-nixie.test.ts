import { expect, onTestFinished, test } from 'bun:test';
import { join } from 'node:path';
import { startNixieProcess } from '../start-nixie-process';
import { stopProcesses } from '../stop-processes';
import { isProcessGone } from './is-process-gone';

function setupTest() {
  return { entry: join(import.meta.dir, 'run-stub-nixie.ts') };
}

test('it answers now with the time of its clock', async () => {
  const ctx = setupTest();
  const nixie = startNixieProcess({ entry: ctx.entry, env: {}, clockMs: 1_000_000 });

  onTestFinished(() => nixie.kill());

  await nixie.ready;

  expect(nixie.request('now', null)).resolves.toBe(1_000_000);
});

test('it holds a hold at stub.point with the work it names, and answers once released', async () => {
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

  const arrival = await nixie.waitForArrival('stub.point');

  nixie.release(arrival);

  expect(arrival.work).toStrictEqual({ kind: 'stub', id: 'work-1' });
  expect(held).resolves.toBe('released');
});

test('it starts a child that keeps running and answers with its PID', async () => {
  const ctx = setupTest();
  const nixie = startNixieProcess({ entry: ctx.entry, env: {}, clockMs: 0 });

  onTestFinished(() => nixie.kill());

  await nixie.ready;

  const started = await nixie.request('startChild', null);

  const childPID = Number(started);

  onTestFinished(() => {
    stopProcesses([childPID]);
  });

  expect(isProcessGone(childPID)).toBe(false);
});

test('it leaves a sleeper that an advance wakes and that does not sleep again', async () => {
  const ctx = setupTest();
  const nixie = startNixieProcess({ entry: ctx.entry, env: {}, clockMs: 0 });

  onTestFinished(() => nixie.kill());

  await nixie.ready;

  await nixie.request('sleepOnce', 1000);

  expect(
    nixie.request('advance', { ms: 1000, settle: true, settleTimeoutMs: 200 }),
  ).resolves.toStrictEqual({ settled: false });
});

test('it starts a poll that sleeps again each time an advance wakes it', async () => {
  const ctx = setupTest();
  const nixie = startNixieProcess({ entry: ctx.entry, env: {}, clockMs: 0 });

  onTestFinished(() => nixie.kill());

  await nixie.ready;

  await nixie.request('startPoll', 1000);

  expect(
    nixie.request('advance', { ms: 1000, settle: true, settleTimeoutMs: 200 }),
  ).resolves.toStrictEqual({ settled: true });
});

test('it exits with code 3 before it is ready when told to refuse', async () => {
  const ctx = setupTest();

  const nixie = startNixieProcess({
    entry: ctx.entry,
    env: { STUB_NIXIE_REFUSE: '1' },
    clockMs: 0,
  });

  onTestFinished(() => nixie.kill());

  const exit = await nixie.exited;

  expect(exit).toStrictEqual({ code: 3, signal: null });
  expect(nixie.ready).rejects.toThrow('the stub refused to start');
});
