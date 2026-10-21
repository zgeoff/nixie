import { expect, test } from 'bun:test';
import { buildMockSandboxSpec } from '@heynixie/sandbox/test-utils';
import { decodeTurnFrame, encodeTurnFrame, guestFrameSchema } from '@heynixie/wire';
import { buildMockTurnFrame } from '@heynixie/wire/test-utils';
import invariant from 'tiny-invariant';
import { z } from 'zod';
import { buildTestFakeSandboxes } from './build-test-fake-sandboxes';
import { buildTestNotesTools } from './build-test-notes-tools';
import { startTestServer } from './start-test-server';

async function setupTest() {
  const notes = buildTestNotesTools('Buy oat milk.');

  const server = await startTestServer(notes.tools);

  const fake = buildTestFakeSandboxes({
    log: server.context.log,
    definitions: server.context.definitions,
    toolTarget: server.endpoint.getToolTarget,
  });

  return { server, fake };
}

test('it builds the fake guest behind the adapter', async () => {
  const ctx = await setupTest();

  expect(ctx.fake.sandboxes).toMatchObject({ id: 'stub-guest', boundary: 'process' });
});

test('it retires the sandboxes an owner holds, which the owner then replaces', async () => {
  const ctx = await setupTest();

  const spec = buildMockSandboxSpec({ kind: 'conversation', grants: [], owner: 'conversation' });

  const old = await ctx.fake.sandboxes.create(spec);
  const retired = await ctx.fake.retireSandboxes('conversation');
  const listed = await ctx.fake.sandboxes.list('conversation');

  expect(retired).toStrictEqual([old.id]);
  expect(listed.map((sandbox) => sandbox.isRetired)).toStrictEqual([true]);
});

test("it gives a tool use of the guest's reply the result of the run's real endpoint", async () => {
  const ctx = await setupTest();

  const run = await ctx.server.endpoint.startRun({
    runID: 'conversation',
    thread: 'conversation',
    tools: ['notes_read'],
    model: { model: 'claude-test-1', profile: 'chat-direct' },
  });

  const sandbox = await ctx.fake.sandboxes.create(
    buildMockSandboxSpec({ kind: 'conversation', grants: [], owner: 'conversation' }),
  );

  ctx.fake.guest.addReplies(
    { toolUse: { name: 'mcp__nixie__notes_read', input: {} } },
    { text: 'It says oat milk.' },
  );

  const stream = await sandbox.spawn({
    argv: ['guest'],
    env: { HOME: '/home/nixie' },
    maxMessageBytes: 1 << 20,
  });

  await stream.send(encodeTurnFrame(buildMockTurnFrame({ tools: { token: run.token } })));

  const messages = await Array.fromAsync(stream.messages);

  const frames = messages.map((message) => decodeTurnFrame(guestFrameSchema, message));
  const ended = frames.at(-1);

  invariant(ended?.type === 'ended');

  const [transcript] = await sandbox.copyOut([
    `/home/nixie/.claude/projects/-home-nixie-conversation/${ended.boundary.sessionID}.jsonl`,
  ]);

  invariant(transcript !== undefined);

  const entries = new TextDecoder()
    .decode(transcript.content)
    .split('\n')
    .filter((line) => line !== '')
    .map((line) => z.object({ role: z.string(), text: z.string() }).parse(JSON.parse(line)));

  const toolResult = entries.at(2);

  invariant(toolResult !== undefined);

  expect(frames.map((frame) => frame.type)).toStrictEqual([
    'read',
    'assistant',
    'assistant',
    'ended',
  ]);

  expect(entries.map((entry) => entry.role)).toStrictEqual([
    'user',
    'assistant',
    'user',
    'assistant',
  ]);

  expect(JSON.parse(toolResult.text)).toMatchObject({
    content: [],
    structuredContent: { text: 'Buy oat milk.' },
  });
});
