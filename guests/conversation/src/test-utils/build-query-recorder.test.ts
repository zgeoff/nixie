import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { InboxMessage } from '@heynixie/wire';
import { buildMockTurnFrame } from '@heynixie/wire/test-utils';
import { runTurn } from '../run-turn';
import { buildQueryRecorder } from './build-query-recorder';
import { createStubToolServer } from './create-stub-tool-server';
import { startStubModel } from './start-stub-model';

async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const home = await mkdtemp(join(tmpdir(), 'nixie-recorder-'));

  stack.defer(() => rm(home, { recursive: true, force: true }));

  const model = stack.adopt(startStubModel(), (stub) => stub.stop());
  const [tools, recorder] = [createStubToolServer(), buildQueryRecorder()];

  return { stack, home, model, tools, recorder };
}

test('it records the options of each query', async () => {
  const ctx = await setupTest();

  const channel = new TransformStream<InboxMessage, InboxMessage>();

  ctx.model.addReplies(
    { toolUse: { name: 'mcp__nixie__note_wait', input: {} } },
    { text: 'Noted.' },
  );

  void ctx.stack.adopt(
    runTurn(buildMockTurnFrame({ profile: { baseURL: ctx.model.url } }), {
      env: {
        HOME: ctx.home,
        PATH: process.env['PATH'] ?? '',
        ANTHROPIC_API_KEY: 'imp-placeholder',
      },
      toolServer: ctx.tools.config,
      messages: channel.readable,
      emit: () => Promise.resolve(),
      runQuery: ctx.recorder.runQuery,
    }),
    async (turn) => {
      ctx.tools.release();

      await turn;
    },
  );

  await ctx.tools.waitForHeldCall();

  expect(ctx.recorder.options).toMatchObject([{ mcpServers: { nixie: ctx.tools.config } }]);
}, 30_000);

test('it resolves a wait once the CLI queues a message sent during a held tool call', async () => {
  const ctx = await setupTest();

  const channel = new TransformStream<InboxMessage, InboxMessage>();

  ctx.model.addReplies(
    { toolUse: { name: 'mcp__nixie__note_wait', input: {} } },
    { text: 'Noted.' },
  );

  void ctx.stack.adopt(
    runTurn(buildMockTurnFrame({ profile: { baseURL: ctx.model.url } }), {
      env: {
        HOME: ctx.home,
        PATH: process.env['PATH'] ?? '',
        ANTHROPIC_API_KEY: 'imp-placeholder',
      },
      toolServer: ctx.tools.config,
      messages: channel.readable,
      emit: () => Promise.resolve(),
      runQuery: ctx.recorder.runQuery,
    }),
    async (turn) => {
      ctx.tools.release();

      await turn;
    },
  );

  await ctx.tools.waitForHeldCall();

  void channel.writable
    .getWriter()
    .write({ uuid: '6e697869-0000-8000-8000-000000000002', text: 'Also buy eggs.' });

  await expect(ctx.recorder.waitForQueued('6e697869-0000-8000-8000-000000000002')).toResolve();
}, 30_000);

test('it resolves a wait for a message the CLI queued before the wait began', async () => {
  const ctx = await setupTest();

  const channel = new TransformStream<InboxMessage, InboxMessage>();

  ctx.model.addReplies(
    { toolUse: { name: 'mcp__nixie__note_wait', input: {} } },
    { text: 'Noted.' },
  );

  void ctx.stack.adopt(
    runTurn(buildMockTurnFrame({ profile: { baseURL: ctx.model.url } }), {
      env: {
        HOME: ctx.home,
        PATH: process.env['PATH'] ?? '',
        ANTHROPIC_API_KEY: 'imp-placeholder',
      },
      toolServer: ctx.tools.config,
      messages: channel.readable,
      emit: () => Promise.resolve(),
      runQuery: ctx.recorder.runQuery,
    }),
    async (turn) => {
      ctx.tools.release();

      await turn;
    },
  );

  await ctx.tools.waitForHeldCall();

  void channel.writable
    .getWriter()
    .write({ uuid: '6e697869-0000-8000-8000-000000000002', text: 'Also buy eggs.' });

  await ctx.recorder.waitForQueued('6e697869-0000-8000-8000-000000000002');

  await expect(ctx.recorder.waitForQueued('6e697869-0000-8000-8000-000000000002')).toResolve();
}, 30_000);
