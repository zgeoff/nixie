import { expect, test } from 'bun:test';
import { mkdir, readFile, readdir, rename, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { readTestRecordKeyRows } from '@heynixie/log/test-utils';
import { waitForCondition } from '@heynixie/testing';
import { startTestTurnInputs } from '../test-utils';
import { getTurnInputsDB } from '../utils/get-turn-inputs-db';

async function setupTest(options: Parameters<typeof startTestTurnInputs>[0] = {}) {
  const ctx = await startTestTurnInputs(options);

  await ctx.turnInputs.runStart();

  return {
    ...ctx,
    openStep: (stepRunID = 'step-1@1') =>
      ctx.turnInputs.openCapture({
        step: { taskID: 'task-a', stepRunID },
        profile: ctx.profile,
        role: 'task',
      }),
    readSpoolNames: () => readdir(ctx.spoolDir),
    readKeyRows: () => readTestRecordKeyRows(ctx.writer),
    readInputRows: () =>
      getTurnInputsDB(ctx.log).selectFrom('turn_inputs').selectAll().orderBy('counter').execute(),
  };
}

test('it stores a body as one file under the data directory and one stored row', async () => {
  const ctx = await setupTest();
  const capture = await ctx.openStep();

  await ctx.writeSpoolFile(capture.baseURL, {
    counter: 1,
    body: new TextEncoder().encode('{"model":"claude-test-1"}'),
  });

  await capture.close({ callFrames: 1 });

  const rows = await ctx.readInputRows();
  const files = await readdir(join(ctx.dataDir, 'turn-inputs'));

  expect(rows).toStrictEqual([
    expect.objectContaining({
      state: 'stored',
      task_id: 'task-a',
      step_run_id: 'step-1@1',
      writer: 'aa',
      counter: 1,
      role: 'task',
      profile: 'main',
      model: 'claude-test-1',
      harness: 'agent-sdk',
      api: 'anthropic-messages',
      endpoint: 'messages',
      route: 'claude',
      upstream_status: 200,
      bytes: 25,
      is_rewritten: 0,
      removed_cause: null,
    }),
  ]);

  expect(files).toStrictEqual([`${rows[0]?.input_id}.bin`]);

  const received1 = await ctx.readSpoolNames();

  expect(received1).toStrictEqual([]);
});

test('it opens a stored body byte for byte, a secret that is not an own value included', async () => {
  const ctx = await setupTest();
  const capture = await ctx.openStep();

  const body = new TextEncoder().encode('{"text":"a token sk-live-1234567890abcdef is here"}');

  await ctx.writeSpoolFile(capture.baseURL, { counter: 1, body });
  await capture.close({ callFrames: 1 });

  const rowRows = await ctx.readInputRows();

  const [row] = rowRows;

  const opened = await ctx.turnInputs.open(row?.input_id ?? '');

  expect(opened).toStrictEqual({ status: 'opened', inputID: row?.input_id ?? '', body });
});

test('it gives a miss with its reason for a .miss file', async () => {
  const ctx = await setupTest();
  const capture = await ctx.openStep();

  await ctx.writeMissFile(capture.baseURL, { counter: 1, reason: 'spool_full' });
  await capture.close({ callFrames: 1 });

  const listed = await ctx.turnInputs.list(10);

  const misses = listed.misses;

  expect(misses).toStrictEqual([
    expect.objectContaining({ reason: 'spool_full', count: 1, writer: 'aa', counter: 1 }),
  ]);

  const received2 = await ctx.readSpoolNames();

  expect(received2).toStrictEqual([]);
});

test('it gives undecodable for a header, a body, a key and a name that fail', async () => {
  const ctx = await setupTest();
  const capture = await ctx.openStep();
  const other = await ctx.openStep('step-2@1');

  const tampered = await ctx.writeSpoolFile(capture.baseURL, {
    counter: 1,
    body: new TextEncoder().encode('one'),
  });

  const tamperedBytes = await readFile(tampered);

  const flipped = new Uint8Array(tamperedBytes);

  flipped[10] = (flipped[10] ?? 0) ^ 0xff;

  await writeFile(tampered, flipped);

  const cutPath = await ctx.writeSpoolFile(capture.baseURL, {
    counter: 2,
    body: new TextEncoder().encode('two'),
  });

  const cutBytes = await readFile(cutPath);

  await writeFile(cutPath, cutBytes.subarray(0, 30));

  await ctx.writeSpoolFile(other.baseURL, {
    counter: 3,
    body: new TextEncoder().encode('three'),
    nameAs: capture.baseURL,
  });

  const renamed = await ctx.writeSpoolFile(capture.baseURL, {
    counter: 4,
    body: new TextEncoder().encode('four'),
  });

  await rename(renamed, renamed.replace('.4.200.cap', '.5.200.cap'));

  await capture.close({ callFrames: 5 });

  const listed = await ctx.turnInputs.list(10);

  const misses = listed.misses;

  expect(
    misses.filter((miss) => miss.reason === 'undecodable').map((miss) => miss.counter),
  ).toStrictEqual(expect.arrayContaining([1, 2, 3, 5]));

  const received3 = await ctx.readInputRows();

  expect(received3).toStrictEqual([]);

  const received4 = await ctx.readSpoolNames();

  expect(received4).toStrictEqual([]);
});

test('it stores no body and writes holds_own_value for a body with an own value', async () => {
  const ctx = await setupTest({
    holdsOwnValue: (body) => new TextDecoder().decode(body).includes('own-secret-value'),
  });

  const capture = await ctx.openStep();

  await ctx.writeSpoolFile(capture.baseURL, {
    counter: 1,
    body: new TextEncoder().encode('has own-secret-value inside'),
  });

  await capture.close({ callFrames: 1 });

  const listed = await ctx.turnInputs.list(10);

  const misses = listed.misses;

  expect(misses.map((miss) => miss.reason)).toStrictEqual(['holds_own_value']);

  const received5 = await ctx.readInputRows();

  expect(received5).toStrictEqual([]);

  const received6 = await readdir(join(ctx.dataDir, 'turn-inputs')).catch(() => []);

  expect(received6).toStrictEqual([]);

  const received7 = await ctx.readSpoolNames();

  expect(received7).toStrictEqual([]);
});

test('it never follows a symlink in the spool', async () => {
  const ctx = await setupTest();
  const capture = await ctx.openStep();

  const target = join(ctx.dataDir, 'outside.txt');

  await writeFile(target, 'outside');

  const tag = capture.baseURL.split('/~in.')[1]?.split('.')[0] ?? '';

  await symlink(target, join(ctx.spoolDir, `${tag}.aa.1.200.cap`));

  await capture.close({ callFrames: 1 });

  const listed = await ctx.turnInputs.list(10);

  const misses = listed.misses;

  expect(misses.map((miss) => miss.reason)).toContain('undecodable');

  const received8 = await readFile(target, 'utf8');

  expect(received8).toBe('outside');
});

test('it gives capture_closed for a file that arrives after the close', async () => {
  const ctx = await setupTest();
  const first = await ctx.openStep();
  const second = await ctx.openStep('step-2@1');

  await first.close({ callFrames: 0 });
  await ctx.writeSpoolFile(first.baseURL, { counter: 1, body: new TextEncoder().encode('late') });

  const work = ctx.turnInputs.startWork();

  await waitForCondition(() => ctx.clock.countSleepers() === 2);

  ctx.clock.advance(1000);

  await waitForCondition(async () => {
    const listed = await ctx.turnInputs.list(10);

    return listed.misses.length === 1;
  });

  await work.stop();
  await second.close({ callFrames: 0 });

  const listed = await ctx.turnInputs.list(10);

  const misses = listed.misses;

  expect(misses.map((miss) => miss.reason)).toStrictEqual(['capture_closed']);

  const received9 = await ctx.readSpoolNames();

  expect(received9).toStrictEqual([]);
});

test('it gives intake_failed and removes the file after 5 failed intakes in a row', async () => {
  const ctx = await setupTest();
  const capture = await ctx.openStep();

  // a folder of bodies that takes no file fails every intake
  await mkdir(join(ctx.dataDir, 'turn-inputs'), { recursive: true, mode: 0o500 });

  await ctx.writeSpoolFile(capture.baseURL, {
    counter: 1,
    body: new TextEncoder().encode('{"text":"MARKER-body-bytes-8f3a1c"}'),
  });

  const work = ctx.turnInputs.startWork();

  await waitForCondition(() => ctx.clock.countSleepers() === 2);

  for (let tick = 0; tick < 5; tick += 1) {
    ctx.clock.advance(1000);

    await waitForCondition(() => ctx.clock.countSleepers() === 2);
  }

  await work.stop();

  const listed = await ctx.turnInputs.list(10);

  const misses = listed.misses;

  expect(misses.map((miss) => miss.reason)).toStrictEqual(['intake_failed']);

  const received10 = await ctx.readSpoolNames();

  expect(received10).toStrictEqual([]);

  const received11 = await ctx.readInputRows();

  expect(received11).toStrictEqual([]);

  const received12 = await ctx.readKeyRows();

  expect(received12).toStrictEqual([expect.anything()]);
  expect(ctx.lines.map((line) => line.event)).toContain('turn_input.intake_failed');
  expect(JSON.stringify(ctx.lines)).not.toContain('MARKER-body-bytes-8f3a1c');
});
