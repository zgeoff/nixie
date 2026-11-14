import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  buildContractEnv,
  collectToolCalls,
  runToolCallWaitProbe,
  toolCallWaitProbeText,
} from '@heynixie/conversation/sdk-contract';
import invariant from 'tiny-invariant';

// The probes call the model on the subscription, so only a contract run enables them.
const isContractRun = process.env['NIXIE_SDK_CONTRACT'] === '1';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'nixie-contract-tool-call-wait-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return { target: { directory, env: buildContractEnv(process.env, directory) } };
}

test.skipIf(!isContractRun)(
  'it gives the result of a tool that returns after 1 second under a wait of 2 seconds',
  async () => {
    const ctx = await setupTest();
    const run = await runToolCallWaitProbe(ctx.target, 1000);

    const result = collectToolCalls(run.messages).at(0)?.result;

    invariant(result);

    expect(result).toStrictEqual({ isError: false, text: toolCallWaitProbeText });
  },
  30_000,
);

test.skipIf(!isContractRun)(
  'it gives no result for a tool that returns after 3 seconds under a wait of 2 seconds',
  async () => {
    const ctx = await setupTest();
    const run = await runToolCallWaitProbe(ctx.target, 3000);

    const result = collectToolCalls(run.messages).at(0)?.result;

    invariant(result);

    expect(result.isError).toBe(true);
    expect(result.text).not.toInclude(toolCallWaitProbeText);
    expect(result.text).toInclude('timed out after 2s');
  },
  30_000,
);
