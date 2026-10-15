import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Options } from '@anthropic-ai/claude-agent-sdk';
import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk';
import invariant from 'tiny-invariant';
import { z } from 'zod';
import { buildContractEnv } from '../test-utils/build-contract-env';
import { buildFiller } from '../test-utils/build-filler';
import { loadSessionTranscript } from '../test-utils/load-session-transcript';
import { runContractQuery } from '../test-utils/run-contract-query';

// The probes call the model on the subscription, so only a contract run enables them. Bun 1.4.2's
// skipIf takes a boolean and has no in-body skip.
const isContractRun = process.env['NIXIE_SDK_CONTRACT'] === '1';

// a config directory of the run's own, and the options of a turn as the conversation guest sets
// them: every SDK compaction off, and an in-process page tool that grows the context by a known step
async function setupTest() {
  const dir = await mkdtemp(join(tmpdir(), 'nixie-contract-overflow-'));

  onTestFinished(() => rm(dir, { recursive: true, force: true }));

  const pages = createSdkMcpServer({
    name: 'pages',
    version: '0.0.0',
    tools: [
      tool('read_page', 'Reads one page of the harbour log.', { page: z.number().int() }, (args) =>
        Promise.resolve({
          content: [{ type: 'text', text: buildFiller(4000, `page ${args.page}`) }],
        }),
      ),
    ],
  });

  const options: Options = {
    cwd: dir,
    model: 'claude-haiku-5-5',
    settingSources: [],
    tools: [],
    allowedTools: ['mcp__pages'],
    mcpServers: { pages },
    permissionMode: 'dontAsk',
    systemPrompt: 'You are a terse assistant in a test. Follow the instructions exactly.',
    settings: { autoCompactEnabled: false, autoCompactWindow: 100_000 },
    env: {
      ...buildContractEnv(process.env, dir),

      // the CLI's own limit lowered to 24,000 tokens, so a few pages pass it and each call stays cheap
      CLAUDE_CODE_BLOCKING_LIMIT_OVERRIDE: '24000',
      MAX_MCP_OUTPUT_TOKENS: '100000',
    },
  };

  return { dir, options };
}

test.skipIf(!isContractRun)(
  'it ends a turn whose tool calls pass the CLI limit with a blocking_limit result and no compaction',
  async () => {
    const ctx = await setupTest();

    const first = await runContractQuery({
      prompt: `Here are harbour notes to keep in mind:\n${buildFiller(14_000, 'note')}\nReply with OK only.`,
      options: ctx.options,
    });

    const firstResult = first.messages.findLast((message) => message.type === 'result');

    invariant(firstResult);

    const run = await runContractQuery({
      prompt:
        'Use read_page to read pages 1, 2, 3 and 4, one call at a time and in that order. Then reply DONE.',
      options: { ...ctx.options, resume: firstResult.session_id },
    });

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
  },
  300_000,
);

test.skipIf(!isContractRun)(
  'it drops a failed overflow turn from a fork at the last committed boundary',
  async () => {
    const ctx = await setupTest();

    const first = await runContractQuery({
      prompt: `Here are harbour notes to keep in mind:\n${buildFiller(14_000, 'note')}\nReply with OK only.`,
      options: ctx.options,
    });

    const boundary = first.messages.findLast((message) => message.type === 'assistant');

    invariant(boundary);

    const failed = await runContractQuery({
      prompt:
        'Use read_page to read pages 1, 2, 3 and 4, one call at a time and in that order. Then reply DONE.',
      options: { ...ctx.options, resume: boundary.session_id },
    });

    const failedResult = failed.messages.at(-1);

    const original = await loadSessionTranscript(ctx.dir, boundary.session_id);

    const fork = await runContractQuery({
      prompt: 'Reply with OK only.',
      options: {
        ...ctx.options,
        resume: boundary.session_id,
        resumeSessionAt: boundary.uuid,
        forkSession: true,
      },
    });

    const forkResult = fork.messages.at(-1);

    invariant(forkResult?.type === 'result');

    const forked = await loadSessionTranscript(ctx.dir, forkResult.session_id);

    expect(failedResult).toMatchObject({ type: 'result', terminal_reason: 'blocking_limit' });
    expect(JSON.stringify(original)).toInclude('Prompt is too long');
    expect(JSON.stringify(original)).toInclude('"type":"tool_use"');
    expect(forkResult).toMatchObject({ subtype: 'success', is_error: false });
    expect(forkResult.session_id).not.toBe(boundary.session_id);
    expect(JSON.stringify(forked)).not.toInclude('Prompt is too long');
    expect(JSON.stringify(forked)).not.toInclude('"type":"tool_use"');
  },
  300_000,
);

test.skipIf(!isContractRun)(
  'it ends a turn that the model API refuses for length with a prompt_too_long result',
  async () => {
    const ctx = await setupTest();

    const run = await runContractQuery({
      prompt: `${buildFiller(1_050_000, 'note')}\nReply with OK only.`,
      options: {
        ...ctx.options,
        env: {
          ...ctx.options.env,

          // the CLI's limit raised past the model's 1,000,000-token window, so the API refuses
          CLAUDE_CODE_BLOCKING_LIMIT_OVERRIDE: '10000000',
        },
      },
    });

    expect(run.messages.at(-1)).toMatchObject({
      type: 'result',
      subtype: 'success',
      is_error: true,
      terminal_reason: 'prompt_too_long',
      result: 'Prompt is too long',
    });
  },
  300_000,
);

test.skipIf(!isContractRun)(
  'it ends a turn for a model that does not exist with api_error, never an overflow reason',
  async () => {
    const ctx = await setupTest();

    const run = await runContractQuery({
      prompt: 'Reply with OK only.',
      options: { ...ctx.options, model: 'claude-nonesuch-9' },
    });

    expect(run.messages.at(-1)).toMatchObject({
      type: 'result',
      is_error: true,
      terminal_reason: 'api_error',
    });
  },
  300_000,
);

test.skipIf(!isContractRun)(
  'it ends a turn that reaches the output cap with api_error, never an overflow reason',
  async () => {
    const ctx = await setupTest();

    const run = await runContractQuery({
      prompt: 'Write a 400-word story about a lighthouse.',
      options: {
        ...ctx.options,
        env: { ...ctx.options.env, CLAUDE_CODE_MAX_OUTPUT_TOKENS: '16' },
      },
    });

    expect(run.messages.at(-1)).toMatchObject({
      type: 'result',
      is_error: true,
      terminal_reason: 'api_error',
    });
  },
  300_000,
);
