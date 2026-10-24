import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Options } from '@anthropic-ai/claude-agent-sdk';
import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk';
import { toolOutputLimitTokens } from '@heynixie/wire';
import invariant from 'tiny-invariant';
import { z } from 'zod';
import { buildContractEnv } from '../test-utils/build-contract-env';
import { collectToolCalls } from '../test-utils/collect-tool-calls';
import { runContractQuery } from '../test-utils/run-contract-query';

// The probes call the model on the subscription, so only a contract run enables them. Bun 1.4.2's
// skipIf takes a boolean and has no in-body skip.
const isContractRun = process.env['NIXIE_SDK_CONTRACT'] === '1';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'nixie-contract-tool-output-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const options: Options = {
    cwd: directory,
    model: 'claude-haiku-5-5',
    settingSources: [],
    tools: [],
    allowedTools: ['mcp__pages'],
    permissionMode: 'dontAsk',
    maxTurns: 3,
    systemPrompt: 'You are a terse assistant in a test. Follow the instructions exactly.',
    env: buildContractEnv(process.env, directory),
  };

  return { options };
}

test.skipIf(!isContractRun)(
  'it saves a page result past 50,000 characters to a file under the CLI defaults',
  async () => {
    const ctx = await setupTest();

    const text = Array.from(
      { length: 700 },
      (_, index) =>
        `Log ${index}: the lamp burned [→ https://lighthouses.example/archive/log/${index}/entry]`,
    ).join('\n');

    const pages = createSdkMcpServer({
      name: 'pages',
      version: '0.0.0',
      tools: [
        tool('read_page', 'Reads the lighthouse archive page.', { page: z.number().int() }, () =>
          Promise.resolve({
            content: [],
            structuredContent: { status: 200, text, isTruncated: false, blocked: null },
          }),
        ),
      ],
    });

    const run = await runContractQuery({
      prompt: 'Call read_page once for page 1, then reply DONE.',
      options: { ...ctx.options, mcpServers: { pages } },
    });

    const read = collectToolCalls(run.messages).at(0)?.result;

    invariant(read);

    expect(text.length).toBeGreaterThan(50_000);
    expect(read.text).toInclude('exceeds maximum allowed tokens. Output has been saved to');
    expect(read.text).not.toInclude('Log 0: the lamp burned');
  },
  120_000,
);

test.skipIf(!isContractRun)(
  'it passes a page at the default text limit to the model whole under the guest tool-output settings',
  async () => {
    const ctx = await setupTest();

    const text = Array.from(
      { length: 240 },
      (_, index) =>
        `Log ${index}: the lamp burned [→ https://lighthouses.example/archive/log/${index}/entry]`,
    ).join('\n');

    const pages = createSdkMcpServer({
      name: 'pages',
      version: '0.0.0',
      tools: [
        tool('read_page', 'Reads the lighthouse archive page.', { page: z.number().int() }, () =>
          Promise.resolve({
            content: [],
            structuredContent: { status: 200, text, isTruncated: true, blocked: null },
          }),
        ),
      ],
    });

    const run = await runContractQuery({
      prompt: 'Call read_page once for page 1, then reply DONE.',
      options: {
        ...ctx.options,
        mcpServers: { pages },
        env: {
          ...ctx.options.env,
          MAX_MCP_OUTPUT_TOKENS: String(toolOutputLimitTokens),
          ENABLE_MCP_LARGE_OUTPUT_FILES: '0',
        },
      },
    });

    const read = collectToolCalls(run.messages).at(0)?.result;

    invariant(read);

    expect(Buffer.byteLength(text)).toBeWithin(19_000, 20_001);
    expect(read.text).toInclude('lighthouses.example/archive/log/239/entry');
    expect(read.text).not.toInclude('OUTPUT TRUNCATED');
    expect(read.text).not.toInclude('Output has been saved to');
    expect(read.text).not.toInclude('<persisted-output>');
  },
  120_000,
);

test.skipIf(!isContractRun)(
  'it cuts a result past the guest tool-output limit inline and never saves it to a file',
  async () => {
    const ctx = await setupTest();

    const text = Array.from(
      { length: 1500 },
      (_, index) =>
        `Log ${index}: the lamp burned [→ https://lighthouses.example/archive/log/${index}/entry]`,
    ).join('\n');

    const pages = createSdkMcpServer({
      name: 'pages',
      version: '0.0.0',
      tools: [
        tool('read_page', 'Reads the lighthouse archive page.', { page: z.number().int() }, () =>
          Promise.resolve({
            content: [],
            structuredContent: { status: 200, text, isTruncated: false, blocked: null },
          }),
        ),
      ],
    });

    const run = await runContractQuery({
      prompt: 'Call read_page once for page 1, then reply DONE.',
      options: {
        ...ctx.options,
        mcpServers: { pages },
        env: {
          ...ctx.options.env,
          MAX_MCP_OUTPUT_TOKENS: String(toolOutputLimitTokens),
          ENABLE_MCP_LARGE_OUTPUT_FILES: '0',
        },
      },
    });

    const read = collectToolCalls(run.messages).at(0)?.result;

    invariant(read);

    expect(text.length).toBeGreaterThan(100_000);
    expect(read.text.length).toBeLessThan(50_000);
    expect(read.text).toInclude('Log 0: the lamp burned');
    expect(read.text).toInclude(`OUTPUT TRUNCATED - exceeded ${toolOutputLimitTokens} token limit`);
    expect(read.text).not.toInclude('Output has been saved to');
    expect(read.text).not.toInclude('<persisted-output>');
  },
  120_000,
);
