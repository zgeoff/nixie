import { expect, test } from 'bun:test';
import { buildReadinessChecks } from './build-readiness-checks';
import { buildStartState } from './build-start-state';

function setupTest() {
  const state = buildStartState({ isReady: true, reason: null });
  const checks = buildReadinessChecks(state, { read: () => ({ isReady: true, reason: null }) });

  return { state, checks };
}

test('it reports the imp host with the refresh report while impd does not answer', async () => {
  const state = buildStartState({ isReady: true, reason: null });

  state.update({ areImagesAdded: true });

  const checks = buildReadinessChecks(state, {
    read: (part) =>
      ({
        imp_runtime: { isReady: false, reason: 'impd does not answer' },
        disk: { isReady: true, reason: null },
      })[part],
  });

  const report = await checks.readiness.imp_host();

  expect(report).toStrictEqual({
    isReady: false,
    reason: 'impd does not answer',
  });
});

test('it reports the imp host unready while impd answers and the images are not all added', async () => {
  const ctx = setupTest();

  const report = await ctx.checks.readiness.imp_host();

  expect(report).toStrictEqual({
    isReady: false,
    reason: 'the images in the sandbox manifest are not all added',
  });
});

test('it reports the imp host ready once impd answers and the images are added', async () => {
  const ctx = setupTest();

  ctx.state.update({ areImagesAdded: true });

  const report = await ctx.checks.readiness.imp_host();

  expect(report).toStrictEqual({ isReady: true, reason: null });
});

test('it reports the disk with the refresh report', async () => {
  const state = buildStartState({ isReady: true, reason: null });

  const checks = buildReadinessChecks(state, {
    read: (part) =>
      ({
        imp_runtime: { isReady: true, reason: null },
        disk: { isReady: false, reason: 'the data volume is 93% full' },
      })[part],
  });

  const report = await checks.readiness.disk();

  expect(report).toStrictEqual({
    isReady: false,
    reason: 'the data volume is 93% full',
  });
});

test('it reports the conversation imp unready before it starts', async () => {
  const ctx = setupTest();

  const report = await ctx.checks.readiness.conversation_imp();

  expect(report).toStrictEqual({
    isReady: false,
    reason: 'the conversation imp has not started',
  });
});

test('it keeps a started conversation imp unready until the runners start', async () => {
  const ctx = setupTest();

  ctx.state.update({ conversation: { isReady: true, reason: null } });

  const report = await ctx.checks.readiness.conversation_imp();

  expect(report).toStrictEqual({
    isReady: false,
    reason: 'the runners have not started',
  });
});

test('it reports the conversation imp ready once the runners start', async () => {
  const ctx = setupTest();

  ctx.state.update({ conversation: { isReady: true, reason: null }, areRunnersStarted: true });

  const report = await ctx.checks.readiness.conversation_imp();

  expect(report).toStrictEqual({ isReady: true, reason: null });
});

test('it reports the conversation turns as passing before any turn fails', async () => {
  const ctx = setupTest();

  const report = await ctx.checks.advisory.conversation_turns();

  expect(report).toStrictEqual({ isReady: true, reason: null });
});

test('it reports failing turns in the advisory part and leaves the conversation imp ready', async () => {
  const ctx = setupTest();

  ctx.state.update({
    conversation: { isReady: true, reason: null },
    areRunnersStarted: true,
    turns: { isReady: false, reason: 'the last 3 turns failed' },
  });

  const advisory = await ctx.checks.advisory.conversation_turns();
  const readiness = await ctx.checks.readiness.conversation_imp();

  expect(advisory).toStrictEqual({ isReady: false, reason: 'the last 3 turns failed' });
  expect(readiness).toStrictEqual({ isReady: true, reason: null });
});
