import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  buildContractEnv,
  runStartToolsProbe,
  startToolNames,
} from '@heynixie/conversation/sdk-contract';

// Each probe calls the model on the subscription, so only a contract run enables it. Bun 1.4.2's
// skipIf takes a boolean and has no in-body skip.
const isContractRun = process.env['NIXIE_SDK_CONTRACT'] === '1';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'nixie-contract-start-tools-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return { target: { directory, env: buildContractEnv(process.env, directory) } };
}

test.skipIf(!isContractRun)(
  'it lists both task_start and coding_start in the tool list that the SDK reports at init',
  async () => {
    const ctx = await setupTest();
    const probe = await runStartToolsProbe(ctx.target);

    expect(probe.tools).toIncludeAllMembers([...startToolNames]);
  },
  30_000,
);
