import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildContractEnv, runPinnedCoreProbe } from '@heynixie/conversation/sdk-contract';
import invariant from 'tiny-invariant';

// Each probe calls the model on the subscription, so only a contract run enables it. Bun 1.4.2's
// skipIf takes a boolean and has no in-body skip.
const isContractRun = process.env['NIXIE_SDK_CONTRACT'] === '1';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'nixie-contract-pinned-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return { target: { directory, env: buildContractEnv(process.env, directory) } };
}

test.skipIf(!isContractRun)(
  'it answers from a changed system prompt on a resume that turns the snapshot off',
  async () => {
    const ctx = await setupTest();
    const run = await runPinnedCoreProbe(ctx.target, 'off');

    const result = run.messages.at(-1);

    invariant(result?.type === 'result' && result.subtype === 'success');

    expect(result.result.trim()).toBe('BANANA');
  },
  29_000,
);

test.skipIf(!isContractRun)(
  'it answers from the recorded system prompt on a resume that keeps the default snapshot',
  async () => {
    const ctx = await setupTest();
    const run = await runPinnedCoreProbe(ctx.target, 'default');

    const result = run.messages.at(-1);

    invariant(result?.type === 'result' && result.subtype === 'success');

    expect(result.result.trim()).toBe('APPLE');
  },
  26_000,
);
