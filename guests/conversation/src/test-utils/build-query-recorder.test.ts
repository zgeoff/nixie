import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { InboxMessage } from '@heynixie/wire';
import { buildMockTurnFrame } from '@heynixie/wire/test-utils';
import { runTurn } from '../run-turn';
import { buildQueryRecorder } from './build-query-recorder';
import { buildStubToolServer } from './build-stub-tool-server';
import { startStubModel } from './start-stub-model';

// A turn held in a note_wait call, as the CLI must be for it to queue a message. The cleanup
// releases the call and lets the turn end before the stub model stops, because the CLI asks the
// model for its next reply once the call returns.
async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const home = await mkdtemp(join(tmpdir(), 'nixie-recorder-'));

  stack.defer(() => rm(home, { recursive: true, force: true }));

  const model = stack.adopt(startStubModel(), (stub) => stub.stop());
  const [tools, recorder] = [buildStubToolServer(), buildQueryRecorder()];
  const channel = new TransformStream<InboxMessage, InboxMessage>();

  // the turn holds in note_wait, then ends at a text reply once the call returns
  model.addReplies({ toolUse: { name: 'mcp__nixie__note_wait', input: {} } }, { text: 'Noted.' });
  void stack.adopt(
    runTurn(buildMockTurnFrame({ profile: { baseURL: model.url } }), {
      // the guest's own environment: its home, its path, and the placeholder the grant replaces
      env: { HOME: home, PATH: process.env['PATH'] ?? '', ANTHROPIC_API_KEY: 'imp-placeholder' },
      toolServer: tools.config,
      messages: channel.readable,
      emit: () => Promise.resolve(),
      runQuery: recorder.runQuery,
    }),
    async (turn) => {
      tools.release();
      await turn;
    },
  );

  return { tools, recorder, writer: channel.writable.getWriter() };
}

test('it records the options of each query', async () => {
  const ctx = await setupTest();

  await ctx.tools.waitForHeldCall();

  expect(ctx.recorder.options).toMatchObject([{ mcpServers: { nixie: ctx.tools.config } }]);
});

test('it resolves a wait once the CLI queues a message sent during a held tool call', async () => {
  const ctx = await setupTest();

  await ctx.tools.waitForHeldCall();
  void ctx.writer.write({ uuid: '6e697869-0000-8000-8000-000000000002', text: 'Also buy eggs.' });

  await expect(ctx.recorder.waitForQueued('6e697869-0000-8000-8000-000000000002')).toResolve();
});

test('it resolves a wait for a message the CLI queued before the wait began', async () => {
  const ctx = await setupTest();

  await ctx.tools.waitForHeldCall();
  void ctx.writer.write({ uuid: '6e697869-0000-8000-8000-000000000002', text: 'Also buy eggs.' });
  await ctx.recorder.waitForQueued('6e697869-0000-8000-8000-000000000002');

  await expect(ctx.recorder.waitForQueued('6e697869-0000-8000-8000-000000000002')).toResolve();
});
