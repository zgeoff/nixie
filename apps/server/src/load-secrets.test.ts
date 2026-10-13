import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadSecrets } from './load-secrets';

// a directory for the secrets file, and the stub that decrypts it as sops would
async function setupTest() {
  const dir = await mkdtemp(join(tmpdir(), 'nixie-secrets-'));

  onTestFinished(() => rm(dir, { recursive: true, force: true }));

  return {
    path: join(dir, 'secrets.yaml'),
    sopsArgv: [process.execPath, join(import.meta.dir, 'test-utils/run-stub-sops.ts')],
  };
}

test('it keeps the deployment key, the impd token and the model credentials', async () => {
  const ctx = await setupTest();
  const key = Buffer.alloc(32, 7).toString('base64');

  await writeFile(
    ctx.path,
    `deployment_key: ${key}\nimpd_token: impd-token\nmodel_credentials:\n  anthropic: model-key\n`,
  );

  const { deploymentKey, ...rest } = await loadSecrets({
    path: ctx.path,
    sopsArgv: ctx.sopsArgv,
  });

  expect(rest).toStrictEqual({
    impdToken: 'impd-token',
    models: { model_credentials: { anthropic: 'model-key' } },
    settings: {},
  });
  expect(deploymentKey.algorithm).toMatchObject({ name: 'AES-KW', length: 256 });
});

test('it keeps the private settings', async () => {
  const ctx = await setupTest();
  const key = Buffer.alloc(32, 7).toString('base64');

  await writeFile(
    ctx.path,
    `deployment_key: ${key}\nimpd_token: impd-token\nsettings:\n  owner_name: Wren Halloway\n`,
  );

  const secrets = await loadSecrets({ path: ctx.path, sopsArgv: ctx.sopsArgv });

  expect(secrets.settings).toStrictEqual({ owner_name: 'Wren Halloway' });
});

test('it refuses an empty setting, and never names the value', async () => {
  const ctx = await setupTest();
  const key = Buffer.alloc(32, 7).toString('base64');

  await writeFile(
    ctx.path,
    `deployment_key: ${key}\nimpd_token: impd-token\nsettings:\n  owner_name: ''\n`,
  );

  expect(loadSecrets({ path: ctx.path, sopsArgv: ctx.sopsArgv })).rejects.toThrow(
    `nixie refuses the secrets in ${ctx.path}:\nsettings.owner_name:`,
  );
});

test('it refuses a deployment key that is not 32 bytes, and never names the value', async () => {
  const ctx = await setupTest();
  const key = Buffer.alloc(16, 7).toString('base64');

  await writeFile(ctx.path, `deployment_key: ${key}\nimpd_token: impd-token\n`);

  const result = loadSecrets({ path: ctx.path, sopsArgv: ctx.sopsArgv });

  expect(result).rejects.toThrow(
    `nixie refuses the secrets in ${ctx.path}:\ndeployment_key: the deployment key is base64 of 32 bytes`,
  );
});

test('it refuses an unknown key', async () => {
  const ctx = await setupTest();
  const key = Buffer.alloc(32, 7).toString('base64');

  await writeFile(ctx.path, `deployment_key: ${key}\nimpd_token: impd-token\nimp_token: x\n`);

  expect(loadSecrets({ path: ctx.path, sopsArgv: ctx.sopsArgv })).rejects.toThrow(
    'Unrecognized key: "imp_token"',
  );
});

test('it refuses to start when sops cannot decrypt the file', async () => {
  const ctx = await setupTest();

  expect(loadSecrets({ path: ctx.path, sopsArgv: ctx.sopsArgv })).rejects.toThrow(
    `sops could not decrypt ${ctx.path}: Error decrypting file:`,
  );
});
