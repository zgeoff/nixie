import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { encodeCaptureTag } from '@heynixie/wire';
import { createSpoolRecipient } from '@heynixie/wire/test-utils';
import { buildStubContractEnv } from '../test-utils/build-stub-contract-env';
import { startStubModel } from '../test-utils/start-stub-model';
import { runBaseURLPathProbe } from './run-base-url-path-probe';

async function setupTest() {
  const recipient = await createSpoolRecipient();

  const segment = encodeCaptureTag({
    captureID: '3f9c2a54-7b1e-4d68-9a0f-5e2c81b6d7a3',
    sealTo: recipient.sealTo,
  });

  const prefix = `/harbour/~in.${segment}`;
  const model = startStubModel({ pathPrefix: prefix });

  onTestFinished(() => model.stop());

  const directory = await mkdtemp(join(tmpdir(), 'nixie-probe-base-url-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return {
    model,
    prefix,
    target: { directory, env: buildStubContractEnv(process.env, model.url, directory) },
  };
}

test('it keeps a tag segment in the base URL on every Messages request of the CLI', async () => {
  const ctx = await setupTest();

  ctx.model.addReplies({ text: 'hello' });

  const run = await runBaseURLPathProbe(ctx.target, `${ctx.model.url}${ctx.prefix}`);

  const paths = ctx.model.requests.map((request) => request.path);

  expect(run.messages.at(-1)).toMatchObject({ type: 'result', subtype: 'success' });
  expect(paths.length).toBeGreaterThan(0);
  expect(paths).toSatisfyAll((path: string) => path === `${ctx.prefix}/v1/messages`);
});
