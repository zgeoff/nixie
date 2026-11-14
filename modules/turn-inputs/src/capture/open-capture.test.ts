import { expect, test } from 'bun:test';
import { readTestRecordKeyRows } from '@heynixie/log/test-utils';
import { decodeCaptureTag } from '@heynixie/wire';
import { createTurnInputs } from '../create-turn-inputs';
import { startTestTurnInputs } from '../test-utils';
import { getTurnInputsDB } from '../utils/get-turn-inputs-db';

async function setupTest(options: Parameters<typeof startTestTurnInputs>[0] = {}) {
  const ctx = await startTestTurnInputs(options);

  return {
    ...ctx,
    step: { taskID: 'task-a', stepRunID: 'step-1@1' },
    readCaptures: () =>
      getTurnInputsDB(ctx.log).selectFrom('turn_input_captures').selectAll().execute(),
    readKeyRows: () => readTestRecordKeyRows(ctx.writer),
  };
}

test('it opens a capture whose base URL carries a tag of the capture', async () => {
  const ctx = await setupTest();

  await ctx.turnInputs.runStart();

  const capture = await ctx.turnInputs.openCapture({
    step: ctx.step,
    profile: ctx.profile,
    role: 'task',
  });

  const rowRows = await ctx.readCaptures();

  const [row] = rowRows;
  const tag = decodeCaptureTag(capture.baseURL.split('/~in.')[1] ?? '');

  expect(capture.baseURL.startsWith(`${ctx.profile.baseURL}/~in.`)).toBeTrue();
  expect(tag?.captureID).toBe(row?.capture_id);

  expect(row).toMatchObject({
    task_id: 'task-a',
    step_run_id: 'step-1@1',
    role: 'task',
    source: 'gateway',
    state: 'open',
    key_id: expect.any(String),
    sealed_private_key: expect.any(Uint8Array),
  });

  const received1 = await ctx.readKeyRows();

  expect(received1).toHaveLength(1);
});

test('it hands back the own base URL and writes nothing with the log off', async () => {
  const ctx = await setupTest({ config: { default: 'off' } });

  await ctx.turnInputs.runStart();

  const capture = await ctx.turnInputs.openCapture({
    step: ctx.step,
    profile: ctx.profile,
    role: 'task',
  });

  expect(capture.baseURL).toBe(ctx.profile.baseURL);

  const received2 = await ctx.readCaptures();

  expect(received2).toStrictEqual([]);

  const received3 = await ctx.readKeyRows();

  expect(received3).toStrictEqual([]);

  const listed = await ctx.turnInputs.list(10);

  expect(listed.misses).toStrictEqual([]);
});

test('it hands back the own base URL for a role outside the roles', async () => {
  const ctx = await setupTest();

  await ctx.turnInputs.runStart();

  const capture = await ctx.turnInputs.openCapture({
    step: ctx.step,
    profile: ctx.profile,
    role: 'memory-writer',
  });

  expect(capture.baseURL).toBe(ctx.profile.baseURL);

  const received4 = await ctx.readCaptures();

  expect(received4).toStrictEqual([]);
});

test('it hands back the own base URL with no turn_input_log section', async () => {
  const ctx = await setupTest({ noConfig: true });

  await ctx.turnInputs.runStart();

  const capture = await ctx.turnInputs.openCapture({
    step: ctx.step,
    profile: ctx.profile,
    role: 'task',
  });

  expect(capture.baseURL).toBe(ctx.profile.baseURL);

  const listed = await ctx.turnInputs.list(10);

  expect(listed.misses).toStrictEqual([]);
});

test.each([
  ['a gateway of no source', 'https://other.example.test/claude'],
  ['a host that a source host prefixes', 'https://gw.example.test.evil.test/claude'],
])('it writes one no_capture_point miss for %s', async (_title, baseURL) => {
  const ctx = await setupTest({
    config: {
      sources: {
        // oxlint-disable-next-line zgeoff/no-abbreviated-names -- the key of the deployment's config
        gateway: { base_url: 'https://gw.example.test', dir: '/spool' },
      },
    },
  });

  await ctx.turnInputs.runStart();

  const capture = await ctx.turnInputs.openCapture({
    step: ctx.step,
    profile: { ...ctx.profile, baseURL },
    role: 'task',
  });

  const listed = await ctx.turnInputs.list(10);

  const misses = listed.misses;

  expect(capture.baseURL).toBe(baseURL);

  expect(misses).toStrictEqual([
    expect.objectContaining({
      reason: 'no_capture_point',
      count: 1,
      taskID: 'task-a',
      stepRunID: 'step-1@1',
      captureID: null,
    }),
  ]);
});

test('it writes one no_capture_point miss for a codex profile', async () => {
  const ctx = await setupTest();

  await ctx.turnInputs.runStart();

  const capture = await ctx.turnInputs.openCapture({
    step: ctx.step,
    profile: { ...ctx.profile, harness: 'codex' },
    role: 'task',
  });

  const listed = await ctx.turnInputs.list(10);

  const misses = listed.misses;

  expect(capture.baseURL).toBe(ctx.profile.baseURL);
  expect(misses.map((miss) => miss.reason)).toStrictEqual(['no_capture_point']);
});

test('it hands back the own base URL, logs a reason and writes no row when the key write fails', async () => {
  const ctx = await setupTest();

  await ctx.turnInputs.runStart();

  const unwrapping = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
    'encrypt',
  ]);

  const broken = createTurnInputs({
    ...ctx.turnInputsOptions,
    log: { ...ctx.log, deploymentKey: unwrapping },
  });

  await broken.runStart();

  const capture = await broken.openCapture({ step: ctx.step, profile: ctx.profile, role: 'task' });

  expect(capture.baseURL).toBe(ctx.profile.baseURL);

  expect(ctx.lines).toContainEqual({
    event: 'turn_input.open_failed',
    fields: { reason: 'store' },
    level: 'warn',
  });

  const received5 = await ctx.readCaptures();

  expect(received5).toStrictEqual([]);

  const received6 = await ctx.readKeyRows();

  expect(received6).toStrictEqual([]);
});

test('it tags a step when the gateway answers yes at the start', async () => {
  const ctx = await setupTest({ answer: true });

  await ctx.turnInputs.runStart();

  const capture = await ctx.turnInputs.openCapture({
    step: ctx.step,
    profile: ctx.profile,
    role: 'task',
  });

  expect(capture.baseURL).toContain('/~in.');
});

test.each([
  ['no', false],
  ['a 500', 500],
  ['no answer', 'never'],
] as const)(
  'it sends no tag and writes one miss when the gateway gives %s',
  async (_title, answer) => {
    const ctx = await setupTest({ answer, askTimeoutMs: 100 });

    await ctx.turnInputs.runStart();

    const capture = await ctx.turnInputs.openCapture({
      step: ctx.step,
      profile: ctx.profile,
      role: 'task',
    });

    const listed = await ctx.turnInputs.list(10);

    const misses = listed.misses;

    expect(capture.baseURL).toBe(ctx.profile.baseURL);
    expect(misses.map((miss) => miss.reason)).toStrictEqual(['no_capture_point']);

    expect(ctx.lines).toContainEqual({
      event: 'turn_input.capture_refused',
      fields: { source: 'gateway', reason: expect.any(String) },
      level: 'warn',
    });
  },
);
