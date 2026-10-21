import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Options } from '@anthropic-ai/claude-agent-sdk';
import { startScriptedModel } from '@heynixie/testing';
import { runContractQuery } from './run-contract-query';
import { startInputStream } from './start-input-stream';

async function setupTest() {
  const model = startScriptedModel();

  onTestFinished(() => model.stop());

  const directory = await mkdtemp(join(tmpdir(), 'nixie-contract-query-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const options: Options = {
    cwd: directory,
    model: 'claude-haiku-5-5',
    tools: [],
    settingSources: [],
    maxTurns: 1,
    env: {
      PATH: process.env['PATH'] ?? '',
      HOME: directory,
      CLAUDE_CONFIG_DIR: directory,
      ANTHROPIC_BASE_URL: model.url,
      ANTHROPIC_API_KEY: 'placeholder',
      CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
    },
  };

  return { model, options };
}

test('it keeps every message the query streamed, through its result', async () => {
  const ctx = await setupTest();

  ctx.model.addReplies({ text: 'harbour reply' });

  const run = await runContractQuery({ prompt: 'Say the reply.', options: ctx.options });

  expect(run.thrown).toBeNull();
  expect(run.messages.at(0)).toMatchObject({ type: 'system', subtype: 'init' });

  expect(run.messages.at(-1)).toMatchObject({
    type: 'result',
    subtype: 'success',
    result: 'harbour reply',
  });
});

test('it keeps what the query threw after an error result', async () => {
  const ctx = await setupTest();
  const run = await runContractQuery({ prompt: 'Say the reply.', options: ctx.options });

  expect(run.thrown).toStartWith('Error: Claude Code returned an error result');
  expect(run.messages.at(-1)).toMatchObject({ type: 'result', is_error: true });
});

test('it ends the run when the message callback says so, with the input still open', async () => {
  const ctx = await setupTest();

  ctx.model.addReplies({ text: 'first reply' });

  const input = startInputStream();

  onTestFinished(() => {
    input.stop();
  });

  input.send('Say the reply.');

  const run = await runContractQuery({
    prompt: input.messages,
    options: ctx.options,
    onMessage: (message) => message.type === 'result',
  });

  expect(run.thrown).toBeNull();
  expect(run.messages.at(-1)).toMatchObject({ type: 'result', result: 'first reply' });
});
