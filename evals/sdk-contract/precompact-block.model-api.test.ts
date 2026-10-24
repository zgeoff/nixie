import { expect, mock, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { HookCallback, Options } from '@anthropic-ai/claude-agent-sdk';
import invariant from 'tiny-invariant';
import { buildContractEnv } from '../test-utils/build-contract-env';
import { buildFiller } from '../test-utils/build-filler';
import { loadSessionTranscript } from '../test-utils/load-session-transcript';
import { runContractQuery } from '../test-utils/run-contract-query';

// Each probe calls the model on the subscription, so only a contract run enables it. Bun 1.4.2's
// skipIf takes a boolean and has no in-body skip.
const isContractRun = process.env['NIXIE_SDK_CONTRACT'] === '1';

// The CLI compacts only a session of more than one turn, so the seed holds 2 turns of about 12,000
// tokens each, which stay under the default window.
async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'nixie-contract-precompact-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const options: Options = {
    cwd: directory,
    model: 'claude-haiku-5-5',
    settingSources: [],
    tools: [],
    maxTurns: 1,
    systemPrompt: 'You are a terse assistant in a test. Follow the instructions exactly.',
    env: buildContractEnv(process.env, directory),
  };

  return { directory, options };
}

test.skipIf(!isContractRun)(
  'it compacts a session past the auto-compact window when no hook blocks it',
  async () => {
    const ctx = await setupTest();

    const first = await runContractQuery({
      prompt: `Keep these tide notes for later.\n${buildFiller(12_000, 'part 1')}\nReply with OK only.`,
      options: ctx.options,
    });

    const firstResult = first.messages.at(-1);

    invariant(firstResult?.type === 'result');

    await runContractQuery({
      prompt: `More tide notes.\n${buildFiller(12_000, 'part 2')}\nReply with OK only.`,
      options: { ...ctx.options, resume: firstResult.session_id },
    });

    const postCompact = mock(() => Promise.resolve({}));

    const run = await runContractQuery({
      prompt: 'How many parts of tide notes do you hold? Answer with the number only.',
      options: {
        ...ctx.options,
        resume: firstResult.session_id,
        forkSession: true,

        // The CLI's auto-compaction fires at 15% of a 100,000-token window, under the seed's 24,000
        // tokens.
        env: {
          ...ctx.options.env,
          CLAUDE_AUTOCOMPACT_PCT_OVERRIDE: '15',
          CLAUDE_CODE_AUTO_COMPACT_WINDOW: '100000',
        },
        hooks: { PostCompact: [{ hooks: [postCompact] }] },
      },
    });

    expect(run.messages).toPartiallyContain({
      type: 'system',
      subtype: 'compact_boundary',
      compact_metadata: expect.toContainEntry(['trigger', 'auto']),
    });

    expect(postCompact).toHaveBeenCalledOnce();
  },
  120_000,
);

test.skipIf(!isContractRun)(
  'it keeps a session whole when a PreCompact hook blocks its automatic compaction',
  async () => {
    const ctx = await setupTest();

    const first = await runContractQuery({
      prompt: `Keep these tide notes for later.\n${buildFiller(12_000, 'part 1')}\nReply with OK only.`,
      options: ctx.options,
    });

    const firstResult = first.messages.at(-1);

    invariant(firstResult?.type === 'result');

    await runContractQuery({
      prompt: `More tide notes.\n${buildFiller(12_000, 'part 2')}\nReply with OK only.`,
      options: { ...ctx.options, resume: firstResult.session_id },
    });

    const preCompact = mock<HookCallback>(() =>
      Promise.resolve({ decision: 'block', reason: 'nixie compacts the session itself' }),
    );

    const postCompact = mock(() => Promise.resolve({}));

    const run = await runContractQuery({
      prompt: 'How many parts of tide notes do you hold? Answer with the number only.',
      options: {
        ...ctx.options,
        resume: firstResult.session_id,
        forkSession: true,

        // The CLI's auto-compaction fires at 15% of a 100,000-token window, under the seed's 24,000
        // tokens.
        env: {
          ...ctx.options.env,
          CLAUDE_AUTOCOMPACT_PCT_OVERRIDE: '15',
          CLAUDE_CODE_AUTO_COMPACT_WINDOW: '100000',
        },
        hooks: {
          PreCompact: [{ hooks: [preCompact] }],
          PostCompact: [{ hooks: [postCompact] }],
        },
      },
    });

    const result = run.messages.at(-1);

    invariant(result?.type === 'result');

    const transcript = await loadSessionTranscript(ctx.directory, result.session_id);

    expect(preCompact).toHaveBeenCalledOnce();
    expect(preCompact.mock.calls[0]?.[0]).toMatchObject({ trigger: 'auto' });
    expect(postCompact).not.toHaveBeenCalled();
    expect(run.messages).not.toPartiallyContain({ type: 'system', subtype: 'compact_boundary' });
    expect(transcript).not.toPartiallyContain({ subtype: 'compact_boundary' });
    expect(result).toMatchObject({ subtype: 'success', is_error: false });

    expect(
      result.usage.input_tokens +
        result.usage.cache_read_input_tokens +
        result.usage.cache_creation_input_tokens,
    ).toBeGreaterThan(20_000);
  },
  120_000,
);
