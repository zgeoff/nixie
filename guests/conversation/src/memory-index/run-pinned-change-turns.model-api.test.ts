import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import invariant from 'tiny-invariant';
import { buildContractEnv } from '../sdk-contract/build-contract-env';
import { pinnedChangeAnswers, runPinnedChangeTurns } from './run-pinned-change-turns';

// The model API lane runs only by hand, and Bun 1.4.2's skipIf takes a boolean.
const isModelRun = process.env['NIXIE_SDK_CONTRACT'] === '1';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'nixie-model-pinned-change-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return { target: { directory, env: buildContractEnv(process.env, directory) } };
}

test.skipIf(!isModelRun)(
  'it gives the current value of a pinned item on each turn after it changes, with a full index and the memory tools',
  async () => {
    const ctx = await setupTest();

    // The conversation model of the reference deployment recipes.
    const runs = await runPinnedChangeTurns(ctx.target, 'claude-opus-5-5');

    const answers = runs.map((run) => {
      const result = run.messages.at(-1);

      invariant(result?.type === 'result' && result.subtype === 'success');

      return result.result.trim();
    });

    expect(answers).toStrictEqual([...pinnedChangeAnswers]);
  },
  25_000,
);
