import { expect, onTestFinished, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { startNixieProcess } from './start-nixie-process';
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

  expect(nixie.ready).rejects.toThrow('nixie exited with code 3: the stub refused to start');
  const exit = await nixie.exited;

  expect(exit).toStrictEqual({ code: 3, signal: null });
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

  await nixie.ready;

  const started = await nixie.request('startChild', null);
  const childPID = Number(started);

  const exit = await nixie.kill();

  // the killed child stays a zombie until its new parent reaps it
  await waitForCondition(
    () =>
      !existsSync(`/proc/${childPID}`) ||
      readFileSync(`/proc/${childPID}/stat`, 'utf8').includes(') Z '),
  );

  expect(exit).toStrictEqual({ code: null, signal: 'SIGKILL' });
});

test('it rejects a request that a kill cut short', async () => {
  const ctx = setupTest();
  const nixie = startNixieProcess({
    entry: ctx.entry,
    env: {},
    clockMs: 0,
    faultPoints: [{ point: 'stub.point' }],
  });

  await nixie.ready;

  const held = nixie.request('hold', 'work-1');

  await nixie.waitForArrival('stub.point');
  await nixie.kill();

  expect(held).rejects.toThrow('nixie exited with signal SIGKILL');
});
