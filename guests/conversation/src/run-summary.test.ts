import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import type { GuestFrame } from '@heynixie/wire';
import { buildMockSummarizeFrame, buildMockTurnFrame } from '@heynixie/wire/test-utils';
import invariant from 'tiny-invariant';
import { runSummary } from './run-summary';
import { runTurn } from './run-turn';
import { createStubToolServer } from './test-utils/create-stub-tool-server';
import { startStubModel } from './test-utils/start-stub-model';

async function setupTest() {
  const home = await mkdtemp(`${tmpdir()}/nixie-summary-`);

  onTestFinished(() => rm(home, { recursive: true, force: true }));

  const model = startStubModel();

  onTestFinished(() => model.stop());

  const frames: GuestFrame[] = [];

  const io = {
    frames,

    env: { HOME: home, PATH: process.env['PATH'] ?? '', ANTHROPIC_API_KEY: 'imp-placeholder' },
    emit: (frame: GuestFrame) => {
      io.frames.push(frame);

      return Promise.resolve();
    },
  };

  model.addReplies({ text: 'The gauge reads 3.2 metres.' });

  await runTurn(
    buildMockTurnFrame({
      profile: { baseURL: model.url },
      input: [{ uuid: crypto.randomUUID(), text: 'What does the tide gauge read?' }],
    }),
    { ...io, toolServer: createStubToolServer().config, messages: [] },
  );

  const ended = io.frames.splice(0).find((frame) => frame.type === 'ended');

  invariant(ended?.type === 'ended', 'the turn the summary forks from did not end');

  return { home, model, io, boundary: ended.boundary };
}

test('it reports the summary with its own chain entry and the token counts of its one call', async () => {
  const ctx = await setupTest();

  ctx.model.addReplies({ text: 'Open threads: the gauge read 3.2 metres.' });

  await runSummary(
    buildMockSummarizeFrame({ profile: { baseURL: ctx.model.url }, resume: ctx.boundary }),
    ctx.io,
  );

  expect(ctx.io.frames).toStrictEqual([
    {
      type: 'summarized',
      boundary: { sessionID: expect.toBeString(), messageID: expect.toBeString() },
      text: 'Open threads: the gauge read 3.2 metres.',
      usage: {
        inputTokens: 10,
        outputTokens: expect.toBeNumber(),
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
      },
    },
  ]);
});

test('it sends the instruction after the session history, with no tools, and writes the summary on a fork', async () => {
  const ctx = await setupTest();

  ctx.model.addReplies({ text: 'Open threads: none.' });

  await runSummary(
    buildMockSummarizeFrame({
      profile: { baseURL: ctx.model.url },
      resume: ctx.boundary,
      systemPrompt: 'You are nixie.',
      instruction: 'Write the summary now.',
    }),
    ctx.io,
  );

  const request = ctx.model.requests.findLast((candidate) => candidate.path === '/v1/messages');

  expect(JSON.stringify(request?.body?.messages)).toSatisfy(
    (messages: string) =>
      messages.includes('What does the tide gauge read?') &&
      messages.includes('The gauge reads 3.2 metres.') &&
      messages.includes('Write the summary now.'),
  );

  expect(request?.body?.tools ?? []).toStrictEqual([]);
  expect(ctx.io.frames).toHaveLength(1);

  expect(ctx.io.frames).toSatisfyAll(
    (frame: GuestFrame) =>
      frame.type === 'summarized' && frame.boundary.sessionID !== ctx.boundary.sessionID,
  );
});

test('it reports a failed call as a failure and never as a summary', async () => {
  const ctx = await setupTest();

  ctx.model.addReplies({ refusal: 'Overloaded, try again later' });

  await runSummary(
    buildMockSummarizeFrame({ profile: { baseURL: ctx.model.url }, resume: ctx.boundary }),
    ctx.io,
  );

  expect(ctx.io.frames).toStrictEqual([
    { type: 'failed', reason: 'error', detail: expect.toStartWith('the summary call ended') },
  ]);
});

test('it reports a session to resume that is not on the guest disk as missing', async () => {
  const ctx = await setupTest();

  await runSummary(
    buildMockSummarizeFrame({
      profile: { baseURL: ctx.model.url },
      resume: {
        sessionID: '7d3c1a52-8a3c-4b46-9a4e-1c51f0f6d001',
        messageID: '7d3c1a52-8a3c-4b46-9a4e-1c51f0f6d002',
      },
    }),
    ctx.io,
  );

  expect(ctx.io.frames).toStrictEqual([
    {
      type: 'failed',
      reason: 'session_missing',
      detail: 'No conversation found with session ID: 7d3c1a52-8a3c-4b46-9a4e-1c51f0f6d001',
    },
  ]);
});

test('it keeps the session it forked from on the guest disk', async () => {
  const ctx = await setupTest();

  ctx.model.addReplies({ text: 'Open threads: none.' });

  await runSummary(
    buildMockSummarizeFrame({ profile: { baseURL: ctx.model.url }, resume: ctx.boundary }),
    ctx.io,
  );

  const files = await readdir(`${ctx.home}/.claude/projects`, { recursive: true });

  expect(files).toSatisfyAny((path: string) => path.endsWith(`/${ctx.boundary.sessionID}.jsonl`));
});
