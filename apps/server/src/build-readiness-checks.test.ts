import { expect, test } from 'bun:test';
import { systemClock } from '@heynixie/clock';
import { buildTestClock } from '@heynixie/testing';
import { buildReadinessChecks } from './build-readiness-checks';
import { buildStartState } from './build-start-state';

test('it reports the imp host with the refresh report while impd does not answer', async () => {
  const state = buildStartState({ isReady: true, reason: null });

  state.update({ images: { isReady: true, reason: null } });

  const checks = buildReadinessChecks(
    state,
    {
      read: (part) =>
        ({
          imp_runtime: { isReady: false, reason: 'impd does not answer' },
          disk: { isReady: true, reason: null },
        })[part],
    },
    systemClock,
  );

  const report = await checks.dependencies.imp_host();

  expect(report).toStrictEqual({
    isReady: false,
    reason: 'impd does not answer',
  });
});

test('it reports the imp host unready while impd answers and the images are not all added', async () => {
  const state = buildStartState({ isReady: true, reason: null });

  const checks = buildReadinessChecks(
    state,
    { read: () => ({ isReady: true, reason: null }) },
    systemClock,
  );

  const report = await checks.dependencies.imp_host();

  expect(report).toStrictEqual({
    isReady: false,
    reason: 'the images in the sandbox manifest are not all added',
  });
});

test('it reports the imp host ready once impd answers and the images are added', async () => {
  const state = buildStartState({ isReady: true, reason: null });

  const checks = buildReadinessChecks(
    state,
    { read: () => ({ isReady: true, reason: null }) },
    systemClock,
  );

  state.update({ images: { isReady: true, reason: null } });

  const report = await checks.dependencies.imp_host();

  expect(report).toStrictEqual({ isReady: true, reason: null });
});

test('it reports the disk with the refresh report', async () => {
  const state = buildStartState({ isReady: true, reason: null });

  const checks = buildReadinessChecks(
    state,
    {
      read: (part) =>
        ({
          imp_runtime: { isReady: true, reason: null },
          disk: { isReady: false, reason: 'the data volume is 93% full' },
        })[part],
    },
    systemClock,
  );

  const report = await checks.dependencies.disk();

  expect(report).toStrictEqual({
    isReady: false,
    reason: 'the data volume is 93% full',
  });
});

test('it reports the conversation imp unready before it starts', async () => {
  const state = buildStartState({ isReady: true, reason: null });

  const checks = buildReadinessChecks(
    state,
    { read: () => ({ isReady: true, reason: null }) },
    systemClock,
  );

  const report = await checks.dependencies.conversation_imp();

  expect(report).toStrictEqual({
    isReady: false,
    reason: 'the conversation imp has not started',
  });
});

test('it keeps a started conversation imp unready until the runners start', async () => {
  const state = buildStartState({ isReady: true, reason: null });

  const checks = buildReadinessChecks(
    state,
    { read: () => ({ isReady: true, reason: null }) },
    systemClock,
  );

  state.update({ conversation: { isReady: true, reason: null } });

  const report = await checks.dependencies.conversation_imp();

  expect(report).toStrictEqual({
    isReady: false,
    reason: 'the runners have not started',
  });
});

test('it reports the conversation imp ready once the runners start', async () => {
  const state = buildStartState({ isReady: true, reason: null });

  const checks = buildReadinessChecks(
    state,
    { read: () => ({ isReady: true, reason: null }) },
    systemClock,
  );

  state.update({ conversation: { isReady: true, reason: null }, areRunnersStarted: true });

  const report = await checks.dependencies.conversation_imp();

  expect(report).toStrictEqual({ isReady: true, reason: null });
});

test('it reports the conversation turns as passing before any turn fails', async () => {
  const state = buildStartState({ isReady: true, reason: null });

  const checks = buildReadinessChecks(
    state,
    { read: () => ({ isReady: true, reason: null }) },
    systemClock,
  );

  const report = await checks.advisory.conversation_turns();

  expect(report).toStrictEqual({ isReady: true, reason: null });
});

test('it reports failing turns in the advisory part and leaves the conversation imp ready', async () => {
  const state = buildStartState({ isReady: true, reason: null });

  const checks = buildReadinessChecks(
    state,
    { read: () => ({ isReady: true, reason: null }) },
    systemClock,
  );

  state.update({
    conversation: { isReady: true, reason: null },
    areRunnersStarted: true,
    turns: { isReady: false, reason: 'the last 3 turns failed' },
  });

  const advisory = await checks.advisory.conversation_turns();
  const readiness = await checks.dependencies.conversation_imp();

  expect(advisory).toStrictEqual({ isReady: false, reason: 'the last 3 turns failed' });
  expect(readiness).toStrictEqual({ isReady: true, reason: null });
});

test('it reports backups unready before the backup schedule starts', async () => {
  const state = buildStartState({ isReady: true, reason: null });
  const clock = buildTestClock(Date.parse('2026-11-02T08:00:00Z'));

  const checks = buildReadinessChecks(
    state,
    { read: () => ({ isReady: true, reason: null }) },
    clock,
  );

  const report = await checks.dependencies.backups();

  expect(report).toStrictEqual({ isReady: false, reason: 'the backup schedule has not started' });
});

test('it reports backups ready when the deployment turns them off', async () => {
  const state = buildStartState({ isReady: true, reason: null });
  const clock = buildTestClock(Date.parse('2026-11-02T08:00:00Z'));

  const checks = buildReadinessChecks(
    state,
    { read: () => ({ isReady: true, reason: null }) },
    clock,
  );

  state.update({ backups: { state: 'off' } });

  const report = await checks.dependencies.backups();

  expect(report).toStrictEqual({ isReady: true, reason: null });
});

test('it reports backups ready while no set has published within twice the interval of the start', async () => {
  const state = buildStartState({ isReady: true, reason: null });
  const clock = buildTestClock(Date.parse('2026-11-02T08:00:00Z'));

  const checks = buildReadinessChecks(
    state,
    { read: () => ({ isReady: true, reason: null }) },
    clock,
  );

  state.update({
    backups: {
      state: 'on',
      intervalMs: 3_600_000,
      startedAt: Date.parse('2026-11-02T08:00:00Z'),
      health: { lastUploadAt: null, newestSetAt: Date.parse('2026-11-02T08:00:00Z'), notice: null },
    },
  });

  clock.advance(7_199_999);

  const report = await checks.dependencies.backups();

  expect(report).toStrictEqual({
    isReady: true,
    reason: null,
    details: { newest_set_age_seconds: 7199, last_upload_at: null },
  });
});

test('it reports backups unready once no receipt arrives within twice the interval', async () => {
  const state = buildStartState({ isReady: true, reason: null });
  const clock = buildTestClock(Date.parse('2026-11-02T08:00:00Z'));

  const checks = buildReadinessChecks(
    state,
    { read: () => ({ isReady: true, reason: null }) },
    clock,
  );

  state.update({
    backups: {
      state: 'on',
      intervalMs: 3_600_000,
      startedAt: Date.parse('2026-11-01T20:00:00Z'),
      health: {
        lastUploadAt: Date.parse('2026-11-02T06:00:00Z'),
        newestSetAt: Date.parse('2026-11-02T07:00:00Z'),
        notice: null,
      },
    },
  });

  const report = await checks.dependencies.backups();

  expect(report).toStrictEqual({
    isReady: false,
    reason: 'no backup set has published in the last 120 minutes',
    details: { newest_set_age_seconds: 3600, last_upload_at: '2026-11-02T06:00:00.000Z' },
  });
});

test('it reports backups ready again once a receipt arrives', async () => {
  const state = buildStartState({ isReady: true, reason: null });
  const clock = buildTestClock(Date.parse('2026-11-02T08:00:00Z'));

  const checks = buildReadinessChecks(
    state,
    { read: () => ({ isReady: true, reason: null }) },
    clock,
  );

  state.update({
    backups: {
      state: 'on',
      intervalMs: 3_600_000,
      startedAt: Date.parse('2026-11-01T20:00:00Z'),
      health: {
        lastUploadAt: Date.parse('2026-11-02T06:00:00Z'),
        newestSetAt: Date.parse('2026-11-02T07:00:00Z'),
        notice: null,
      },
    },
  });

  state.update({
    backups: {
      state: 'on',
      intervalMs: 3_600_000,
      startedAt: Date.parse('2026-11-01T20:00:00Z'),
      health: {
        lastUploadAt: Date.parse('2026-11-02T07:59:00Z'),
        newestSetAt: Date.parse('2026-11-02T07:00:00Z'),
        notice: null,
      },
    },
  });

  const report = await checks.dependencies.backups();

  expect(report).toStrictEqual({
    isReady: true,
    reason: null,
    details: { newest_set_age_seconds: 3600, last_upload_at: '2026-11-02T07:59:00.000Z' },
  });
});
