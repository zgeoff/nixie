import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import invariant from 'tiny-invariant';
import { stubSopsPath } from '../test-utils/stub-sops-path';
import { loadSecrets } from './load-secrets';

async function setupTest() {
  const deploymentKey = Buffer.alloc(32, 7).toString('base64');

  const directory = await mkdtemp(join(tmpdir(), 'nixie-secrets-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return {
    deploymentKey,
    path: join(directory, 'secrets.yaml'),
    sopsArgv: [process.execPath, stubSopsPath],
  };
}

test('it keeps the deployment key, the impd token and the top-level export secrets', async () => {
  const ctx = await setupTest();

  await writeFile(
    ctx.path,
    `deployment_key: ${ctx.deploymentKey}\nimpd_token: impd-token\ndefinitions_export_token: export-token\ndefinitions_export_app_key: |\n  line-one\n  line-two\n`,
  );

  const secrets = await loadSecrets({ path: ctx.path, sopsArgv: ctx.sopsArgv });

  expect({
    impdToken: secrets.impdToken,
    definitionsExportToken: secrets.definitionsExportToken,
    definitionsExportAppKey: secrets.definitionsExportAppKey,
    algorithm: secrets.deploymentKey.algorithm,
  }).toMatchObject({
    impdToken: 'impd-token',
    definitionsExportToken: 'export-token',
    definitionsExportAppKey: 'line-one\nline-two\n',
    algorithm: { name: 'AES-KW', length: 256 },
  });
});

test('it keeps no impd token when the secrets file holds none', async () => {
  const ctx = await setupTest();

  await writeFile(ctx.path, `deployment_key: ${ctx.deploymentKey}\n`);

  const secrets = await loadSecrets({ path: ctx.path, sopsArgv: ctx.sopsArgv });

  expect(secrets.impdToken).toBeNull();
});

test('it derives a fingerprint key that signs and never exports', async () => {
  const ctx = await setupTest();

  await writeFile(ctx.path, `deployment_key: ${ctx.deploymentKey}\n`);

  const secrets = await loadSecrets({ path: ctx.path, sopsArgv: ctx.sopsArgv });

  expect({
    algorithm: secrets.fingerprintKey.algorithm.name,
    isExtractable: secrets.fingerprintKey.extractable,
    usages: secrets.fingerprintKey.usages,
  }).toStrictEqual({ algorithm: 'HMAC', isExtractable: false, usages: ['sign'] });
});

test('it adds every value of the file to the live set of own values', async () => {
  const ctx = await setupTest();

  await writeFile(
    ctx.path,
    `deployment_key: ${ctx.deploymentKey}\nimpd_token: impd-token-value\nmodel_credentials:\n  anthropic: model-key-value\nconnector_credentials:\n  search: search-key-value\nsettings:\n  owner_name: Wren Halloway\n`,
  );

  const secrets = await loadSecrets({ path: ctx.path, sopsArgv: ctx.sopsArgv });

  expect(secrets.ownValues.read({ minChars: 8 })).toStrictEqual([
    ctx.deploymentKey,
    'impd-token-value',
    'model-key-value',
    'search-key-value',
  ]);
});

test('it reads a connector credential through the resolver and the file backend', async () => {
  const ctx = await setupTest();

  await writeFile(
    ctx.path,
    `deployment_key: ${ctx.deploymentKey}\nconnector_credentials:\n  search: search-key-a\n`,
  );

  const secrets = await loadSecrets({ path: ctx.path, sopsArgv: ctx.sopsArgv });

  const ref = secrets.resolveCredential({ class: 'connector', reference: 'deployment:search' });

  invariant(ref !== null);

  expect(ref).toStrictEqual({ backend: 'file', group: 'connector_credentials', name: 'search' });
  expect(secrets.readFileValue(ref)).toBe('search-key-a');
});

test('it reads a setting the prompt needs', async () => {
  const ctx = await setupTest();

  await writeFile(
    ctx.path,
    `deployment_key: ${ctx.deploymentKey}\nsettings:\n  owner_name: Wren Halloway\n`,
  );

  const secrets = await loadSecrets({ path: ctx.path, sopsArgv: ctx.sopsArgv });

  expect(secrets.readSetting('deployment:owner_name')).toBe('Wren Halloway');
});

test('it refuses an empty setting, and never names the value', async () => {
  const ctx = await setupTest();

  await writeFile(
    ctx.path,
    `deployment_key: ${ctx.deploymentKey}\nimpd_token: impd-token\nsettings:\n  owner_name: ''\n`,
  );

  expect(loadSecrets({ path: ctx.path, sopsArgv: ctx.sopsArgv })).rejects.toThrow(
    `nixie refuses the secrets in ${ctx.path}:\nsettings.owner_name:`,
  );
});

test('it refuses a deployment key that is not 32 bytes, and never names the value', async () => {
  const ctx = await setupTest();

  const key = Buffer.alloc(16, 7).toString('base64');

  await writeFile(ctx.path, `deployment_key: ${key}\nimpd_token: impd-token\n`);

  expect(loadSecrets({ path: ctx.path, sopsArgv: ctx.sopsArgv })).rejects.toThrow(
    `nixie refuses the secrets in ${ctx.path}:\ndeployment_key: the deployment key is base64 of 32 bytes`,
  );
});

test('it refuses an unknown key', async () => {
  const ctx = await setupTest();

  await writeFile(
    ctx.path,
    `deployment_key: ${ctx.deploymentKey}\nimpd_token: impd-token\nimp_token: x\n`,
  );

  expect(loadSecrets({ path: ctx.path, sopsArgv: ctx.sopsArgv })).rejects.toThrow(
    'Unrecognized key: "imp_token"',
  );
});

test('it names the file and the exit code, never the decryptor output, when sops fails', async () => {
  const ctx = await setupTest();

  expect(loadSecrets({ path: ctx.path, sopsArgv: ctx.sopsArgv })).rejects.toThrowWithMessage(
    Error,
    `sops could not decrypt ${ctx.path} and exited with code 1`,
  );
});
