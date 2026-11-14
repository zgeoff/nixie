import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildContractEnv, runReportFieldsProbe } from '@heynixie/conversation/sdk-contract';

// The probe calls the model on the subscription, so only a contract run enables it.
const isContractRun = process.env['NIXIE_SDK_CONTRACT'] === '1';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'nixie-contract-report-fields-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return { target: { directory, env: buildContractEnv(process.env, directory) } };
}

test.skipIf(!isContractRun)(
  'it passes a report call with an object of fields to an HTTP tool as the model wrote it',
  async () => {
    const ctx = await setupTest();
    const probe = await runReportFieldsProbe(ctx.target);

    expect(probe.calls).toStrictEqual([
      {
        name: 'note_read',
        arguments: {
          summary: 'Found two cafes.',
          fields: { city: 'Lyon', stops: ['Alma', 'Bar'] },
        },
      },
    ]);
  },
  60_000,
);
