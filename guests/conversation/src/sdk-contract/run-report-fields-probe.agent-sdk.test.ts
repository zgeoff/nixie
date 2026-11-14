import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildStubContractEnv } from '../test-utils/build-stub-contract-env';
import { startStubModel } from '../test-utils/start-stub-model';
import { runReportFieldsProbe } from './run-report-fields-probe';

async function setupTest() {
  const model = startStubModel();

  onTestFinished(() => model.stop());

  const directory = await mkdtemp(join(tmpdir(), 'nixie-probe-report-fields-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return {
    model,
    target: { directory, env: buildStubContractEnv(process.env, model.url, directory) },
  };
}

test('it passes the nested object of a call to an HTTP tool as the model wrote it', async () => {
  const ctx = await setupTest();

  ctx.model.addReplies(
    {
      toolUse: {
        name: 'mcp__nixie__note_read',
        input: {
          summary: 'Found two cafes.',
          fields: { city: 'Lyon', stops: ['Alma', 'Bar'] },
        },
      },
    },
    { text: 'DONE' },
  );

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
});
