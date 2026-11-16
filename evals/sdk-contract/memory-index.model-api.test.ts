import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildContractEnv, runMemoryIndexProbe } from '@heynixie/conversation/sdk-contract';
import invariant from 'tiny-invariant';

// Each probe calls the model on the subscription, so only a contract run enables it. Bun 1.4.2's
// skipIf takes a boolean and has no in-body skip.
const isContractRun = process.env['NIXIE_SDK_CONTRACT'] === '1';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'nixie-contract-memory-index-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return { target: { directory, env: buildContractEnv(process.env, directory) } };
}

test.skipIf(!isContractRun)(
  'it answers with the current value of a pinned item on each resumed turn after a full index',
  async () => {
    const ctx = await setupTest();
    const runs = await runMemoryIndexProbe(ctx.target);

    const answers = runs.map((run) => {
      const result = run.messages.at(-1);

      invariant(result?.type === 'result' && result.subtype === 'success');

      return result.result.trim();
    });

    expect(answers).toStrictEqual(['APPLE', 'BANANA', 'CHERRY']);
  },
  12_000,
);
