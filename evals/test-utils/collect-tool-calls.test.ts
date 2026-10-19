import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Options } from '@anthropic-ai/claude-agent-sdk';
import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk';
import { startScriptedModel } from '@heynixie/testing';
import { z } from 'zod';
import { collectToolCalls } from './collect-tool-calls';
import { runContractQuery } from './run-contract-query';

// the scripted model, and the options of a query that may call two in-process tools: one that
// echoes its text, and one that never answers
async function setupTest() {
  const model = startScriptedModel();

  onTestFinished(() => model.stop());

  const directory = await mkdtemp(join(tmpdir(), 'nixie-tool-calls-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const probe = createSdkMcpServer({
    name: 'probe',
    version: '0.0.0',
    tools: [
      tool('echo', 'Echoes its text.', { text: z.string() }, (args) =>
        Promise.resolve({ content: [{ type: 'text', text: `echo: ${args.text}` }] }),
      ),
      tool('hang', 'Never answers.', {}, () => Promise.withResolvers<never>().promise),
    ],
  });

  const options: Options = {
    cwd: directory,
    model: 'claude-haiku-5-5',
    tools: [],
    settingSources: [],
    allowedTools: ['mcp__probe__echo', 'mcp__probe__hang'],
    mcpServers: { probe },
    permissionMode: 'dontAsk',
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

test('it pairs each tool call with the result the model read, in order', async () => {
  const ctx = await setupTest();

  ctx.model.addReplies(
    { toolUse: { name: 'mcp__probe__echo', input: { text: 'tide' } } },
    { toolUse: { name: 'mcp__probe__missing', input: {} } },
    { text: 'done' },
  );

  const run = await runContractQuery({ prompt: 'Call the tools.', options: ctx.options });

  expect(collectToolCalls(run.messages)).toStrictEqual([
    {
      name: 'mcp__probe__echo',
      input: { text: 'tide' },
      result: { isError: false, text: 'echo: tide' },
    },
    {
      name: 'mcp__probe__missing',
      input: {},
      result: { isError: true, text: expect.toInclude('mcp__probe__missing') },
    },
  ]);
});

test('it keeps a call that never got a result as unanswered', async () => {
  const ctx = await setupTest();

  ctx.model.addReplies({ toolUse: { name: 'mcp__probe__hang', input: {} } });

  const run = await runContractQuery({
    prompt: 'Call the tool.',
    options: ctx.options,
    onMessage: (message) => message.type === 'assistant',
  });

  expect(collectToolCalls(run.messages)).toStrictEqual([
    { name: 'mcp__probe__hang', input: {}, result: null },
  ]);
});
