import { expect, mock, onTestFinished, test } from 'bun:test';
import { mkdtemp, open, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startWriter } from '@heynixie/log';
import { createConversationTask } from '@heynixie/tasks';
import { buildReadinessChecks } from './build-readiness-checks';
import { loadStartState } from './load-start-state';
import { sendTestMessage } from './test-utils/send-test-message';
import { startTestLog } from './test-utils/start-test-log';

async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const dataDir = await mkdtemp(join(tmpdir(), 'nixie-start-state-'));

  stack.defer(() => rm(dataDir, { recursive: true, force: true }));

  const log = await startTestLog(dataDir);

  stack.defer(() => log.writer.stop());

  const context = {
    log,
    clock: log.writer.clock,
    definitions: () => ({ snapshotHash: 'sha256:test' }),
  };

  return {
    dataDir,
    writer: log.writer,
    context,
    restart: async () => {
      await log.writer.stop();

      const restarted = await startWriter({ dataDir });

      stack.defer(() => restarted.stop());

      return restarted;
    },
  };
}

test('it reports the conversation turns as failing after a restart with the stored errors at the limit', async () => {
  const ctx = await setupTest();

  await createConversationTask(ctx.context);

  const runStep = mock(() => Promise.reject(new Error('the model profile is unreachable')));

  await sendTestMessage(ctx.context, runStep, 'Name a river.');
  await sendTestMessage(ctx.context, runStep, 'Name a lake.');
  await sendTestMessage(ctx.context, runStep, 'Name a sea.');

  const restarted = await ctx.restart();
  const state = await loadStartState(restarted);

  const checks = buildReadinessChecks(state, { read: () => ({ isReady: true, reason: null }) });

  const report = await checks.advisory.conversation_turns();

  expect(report).toStrictEqual({
    isReady: false,
    reason: 'the last 3 turns failed',
  });
});

test('it reports the conversation turns as passing after a restart with the stored errors below the limit', async () => {
  const ctx = await setupTest();

  await createConversationTask(ctx.context);

  const runStep = mock(() => Promise.reject(new Error('the model profile is unreachable')));

  await sendTestMessage(ctx.context, runStep, 'Name a river.');
  await sendTestMessage(ctx.context, runStep, 'Name a lake.');

  const restarted = await ctx.restart();
  const state = await loadStartState(restarted);

  const checks = buildReadinessChecks(state, { read: () => ({ isReady: true, reason: null }) });

  const report = await checks.advisory.conversation_turns();

  expect(report).toStrictEqual({
    isReady: true,
    reason: null,
  });
});

test('it reports the conversation turns as passing when the conversation has no errors', async () => {
  const ctx = await setupTest();
  const state = await loadStartState(ctx.writer);

  expect(state.read().turns).toStrictEqual({ isReady: true, reason: null });
});

test('it reports the database and the conversation turns as unchecked when the integrity check fails', async () => {
  const ctx = await setupTest();

  const page = await ctx.writer.db
    .$extendTables<{
      sqlite_schema: { name: string; rootpage: number };
      pragma_page_size: { page_size: number };
    }>()
    .selectFrom(['sqlite_schema', 'pragma_page_size'])
    .select(['rootpage', 'page_size'])
    .where('name', '=', 'web_fetch_links_thread')
    .executeTakeFirstOrThrow();

  await ctx.writer.stop();

  // overwrites the root page of an index that the integrity check reads and the writer's open does not
  const file = await open(join(ctx.dataDir, 'nixie.db'), 'r+');

  onTestFinished(() => file.close());

  await file.write(
    Buffer.alloc(page.page_size, 0xff),
    0,
    page.page_size,
    (page.rootpage - 1) * page.page_size,
  );

  const restarted = await ctx.restart();
  const state = await loadStartState(restarted);

  expect(state.read().database).toStrictEqual({
    isReady: false,
    reason: 'the integrity check found 1 problems',
  });

  expect(state.read().turns).toStrictEqual({
    isReady: false,
    reason: 'the database check at start failed',
  });
});
