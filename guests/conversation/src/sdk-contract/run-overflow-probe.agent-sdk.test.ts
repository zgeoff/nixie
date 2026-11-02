import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildStubContractEnv } from '../test-utils/build-stub-contract-env';
import { startStubModel } from '../test-utils/start-stub-model';
import { runOverflowProbe } from './run-overflow-probe';

async function setupTest() {
  const model = startStubModel();

  onTestFinished(() => model.stop());

  const directory = await mkdtemp(join(tmpdir(), 'nixie-probe-overflow-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return {
    model,
    target: { directory, env: buildStubContractEnv(process.env, model.url, directory) },
  };
}

test('it ends a turn whose tool calls pass the CLI limit with a blocking_limit result before the next model call, and no compaction', async () => {
  const ctx = await setupTest();

  ctx.model.addReplies(
    { text: 'OK', inputTokens: 14_100 },
    { toolUse: { name: 'mcp__pages__read_page', input: { page: 1 } }, inputTokens: 14_150 },
    { toolUse: { name: 'mcp__pages__read_page', input: { page: 2 } }, inputTokens: 18_200 },
    { toolUse: { name: 'mcp__pages__read_page', input: { page: 3 } }, inputTokens: 22_300 },
    { text: 'DONE' },
  );

  const run = await runOverflowProbe(ctx.target, 'tool-calls');

  expect(run.messages.at(-1)).toMatchObject({
    type: 'result',
    subtype: 'success',
    is_error: true,
    terminal_reason: 'blocking_limit',
    result: 'Prompt is too long',
  });

  expect(run.messages).toPartiallyContain({ type: 'assistant', error: 'invalid_request' });
  expect(run.messages).not.toPartiallyContain({ type: 'system', subtype: 'compact_boundary' });
  expect(run.thrown).toBe('Error: Claude Code returned an error result: Prompt is too long');
  expect(ctx.model.requests).toHaveLength(4);
});

test('it ends a turn that the model API refuses for length with a prompt_too_long result', async () => {
  const ctx = await setupTest();

  ctx.model.addReplies({ refusal: 'prompt is too long: 1052113 tokens > 1000000 maximum' });

  const run = await runOverflowProbe(ctx.target, 'model-window');

  expect(run.messages.at(-1)).toMatchObject({
    type: 'result',
    subtype: 'success',
    is_error: true,
    terminal_reason: 'prompt_too_long',
    result: 'Prompt is too long',
  });
});

test('it ends a turn for a model that does not exist with api_error, never an overflow reason', async () => {
  const ctx = await setupTest();

  ctx.model.addReplies(
    { notFound: 'model: claude-nonesuch-9' },
    { notFound: 'model: claude-nonesuch-9' },
  );

  const run = await runOverflowProbe(ctx.target, 'unknown-model');

  expect(run.messages.at(-1)).toMatchObject({
    type: 'result',
    is_error: true,
    terminal_reason: 'api_error',
    result: expect.toInclude('(claude-nonesuch-9)'),
  });
});

test('it ends a turn that keeps reaching the output cap with api_error, never an overflow reason', async () => {
  const ctx = await setupTest();

  ctx.model.addReplies(
    { text: 'The lighthouse stood', isOutputCapped: true },
    { text: 'on the cliff', isOutputCapped: true },
    { text: 'above', isOutputCapped: true },
    { text: 'the grey sea', isOutputCapped: true },
  );

  const run = await runOverflowProbe(ctx.target, 'output-cap');

  expect(run.messages.at(-1)).toMatchObject({
    type: 'result',
    is_error: true,
    terminal_reason: 'api_error',
    result: expect.toInclude('exceeded the 16 output token maximum'),
  });
});
