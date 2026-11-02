import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  buildContractEnv,
  runOverflowForkProbe,
  runOverflowProbe,
} from '@heynixie/conversation/sdk-contract';

// Each probe calls the model on the subscription, so only a contract run enables it. Bun 1.4.2's
// skipIf takes a boolean and has no in-body skip.
const isContractRun = process.env['NIXIE_SDK_CONTRACT'] === '1';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'nixie-contract-overflow-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return { target: { directory, env: buildContractEnv(process.env, directory) } };
}

test.skipIf(!isContractRun)(
  'it ends a turn whose tool calls pass the CLI limit with a blocking_limit result and no compaction',
  async () => {
    const ctx = await setupTest();
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
  },
  20_000,
);

test.skipIf(!isContractRun)(
  'it drops a failed overflow turn from a fork at the last committed boundary',
  async () => {
    const ctx = await setupTest();
    const run = await runOverflowForkProbe(ctx.target);

    const forkResult = run.fork.messages.at(-1);

    expect(run.seed.messages.at(-1)).toMatchObject({
      type: 'result',
      terminal_reason: 'blocking_limit',
    });

    expect(JSON.stringify(run.original)).toInclude('Prompt is too long');
    expect(JSON.stringify(run.original)).toInclude('"type":"tool_use"');
    expect(forkResult).toMatchObject({ type: 'result', subtype: 'success', is_error: false });
    expect(forkResult?.session_id).not.toBe(run.sessionID);
    expect(JSON.stringify(run.forked)).not.toInclude('Prompt is too long');
    expect(JSON.stringify(run.forked)).not.toInclude('"type":"tool_use"');
  },
  22_000,
);

test.skipIf(!isContractRun)(
  'it ends a turn that the model API refuses for length with a prompt_too_long result',
  async () => {
    const ctx = await setupTest();
    const run = await runOverflowProbe(ctx.target, 'model-window');

    expect(run.messages.at(-1)).toMatchObject({
      type: 'result',
      subtype: 'success',
      is_error: true,
      terminal_reason: 'prompt_too_long',
      result: 'Prompt is too long',
    });
  },
  6000,
);

test.skipIf(!isContractRun)(
  'it ends a turn for a model that does not exist with api_error, never an overflow reason',
  async () => {
    const ctx = await setupTest();
    const run = await runOverflowProbe(ctx.target, 'unknown-model');

    expect(run.messages.at(-1)).toMatchObject({
      type: 'result',
      is_error: true,
      terminal_reason: 'api_error',
    });
  },
  5000,
);

test.skipIf(!isContractRun)(
  'it ends a turn that reaches the output cap with api_error, never an overflow reason',
  async () => {
    const ctx = await setupTest();
    const run = await runOverflowProbe(ctx.target, 'output-cap');

    expect(run.messages.at(-1)).toMatchObject({
      type: 'result',
      is_error: true,
      terminal_reason: 'api_error',
    });
  },
  20_000,
);
