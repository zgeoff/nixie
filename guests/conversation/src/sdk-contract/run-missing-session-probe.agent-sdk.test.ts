import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildStubContractEnv } from '../test-utils/build-stub-contract-env';
import { startStubModel } from '../test-utils/start-stub-model';
import { runMissingSessionProbe } from './run-missing-session-probe';

async function setupTest() {
  const model = startStubModel();

  onTestFinished(() => model.stop());

  const directory = await mkdtemp(join(tmpdir(), 'nixie-probe-missing-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return {
    model,
    target: { directory, env: buildStubContractEnv(process.env, model.url, directory) },
  };
}

test('it ends a resume of a session the config directory does not hold in an error result that names the missing session, with no model call', async () => {
  const ctx = await setupTest();
  const run = await runMissingSessionProbe(ctx.target);

  expect(run.messages.at(-1)).toMatchObject({
    type: 'result',
    subtype: 'error_during_execution',
    errors: [expect.stringMatching(/^No conversation found with session ID: /u)],
  });

  expect(ctx.model.requests).toStrictEqual([]);
});
