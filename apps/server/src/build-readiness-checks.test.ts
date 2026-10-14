import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildReadinessChecks } from './build-readiness-checks';
import { buildStartState } from './build-start-state';

async function setupTest() {
  const dataDir = await mkdtemp(join(tmpdir(), 'nixie-readiness-'));

  onTestFinished(() => rm(dataDir, { recursive: true, force: true }));

  const state = buildStartState({ isReady: true, reason: null });
  const checks = buildReadinessChecks(
    state,
    { checkRuntime: () => Promise.resolve({ isReady: true, reason: null }) },
    dataDir,
  );

  return { state, checks };
}

test('it reports the conversation imp unready before it starts', async () => {
  const ctx = await setupTest();

  const report = await ctx.checks.conversation_imp();

  expect(report).toStrictEqual({
    isReady: false,
    reason: 'the conversation imp has not started',
  });
});

test('it keeps a started conversation imp unready until the runners start', async () => {
  const ctx = await setupTest();

  ctx.state.update({ conversation: { isReady: true, reason: null } });

  const report = await ctx.checks.conversation_imp();

  expect(report).toStrictEqual({
    isReady: false,
    reason: 'the runners have not started',
  });
});

test('it reports the conversation imp ready once the runners start', async () => {
  const ctx = await setupTest();

  ctx.state.update({ conversation: { isReady: true, reason: null }, areRunnersStarted: true });

  const report = await ctx.checks.conversation_imp();

  expect(report).toStrictEqual({ isReady: true, reason: null });
});

test('it reports a failing conversation imp unready after the runners start', async () => {
  const ctx = await setupTest();

  ctx.state.update({
    conversation: { isReady: false, reason: 'the last turn failed' },
    areRunnersStarted: true,
  });

  const report = await ctx.checks.conversation_imp();

  expect(report).toStrictEqual({
    isReady: false,
    reason: 'the last turn failed',
  });
});
