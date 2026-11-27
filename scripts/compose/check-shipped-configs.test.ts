import { expect, onTestFinished, test } from 'bun:test';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { $ } from 'bun';

function setupTest() {
  const directory = mkdtempSync(join(tmpdir(), 'nixie-shipped-configs-'));

  onTestFinished(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  const summaryPath = join(directory, 'summary');

  mkdirSync(join(directory, 'apps', 'server'), { recursive: true });
  mkdirSync(join(directory, 'deploy', 'compose'), { recursive: true });
  mkdirSync(join(directory, 'deploy', 'kubernetes'), { recursive: true });
  writeFileSync(summaryPath, '');

  writeFileSync(
    join(directory, 'apps', 'server', 'config.schema.json'),
    JSON.stringify({
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      properties: { server: { type: 'object' } },
      additionalProperties: false,
    }),
  );

  return {
    summaryPath,
    writeShipped: (composeConfig: string, kubernetesConfig: string) => {
      writeFileSync(join(directory, 'deploy', 'compose', 'config.yaml'), composeConfig);

      writeFileSync(
        join(directory, 'deploy', 'kubernetes', 'config.yaml'),
        [
          'kind: ConfigMap',
          'data:',
          '  config.yaml: |',
          ...kubernetesConfig.split('\n').map((line) => `    ${line}`),
          '---',
          'kind: ConfigMap',
          'data:',
          '  other: value',
          '',
        ].join('\n'),
      );
    },
    run: () =>
      $`${process.execPath} ${join(import.meta.dir, 'check-shipped-configs.ts')}`
        .cwd(directory)
        .env({ ...process.env, GITHUB_STEP_SUMMARY: summaryPath })
        .nothrow()
        .quiet(),
  };
}

test('it lists each shipped config in the summary when the schema accepts it', async () => {
  const ctx = setupTest();

  ctx.writeShipped('server: {}\n', 'server: {}');

  const result = await ctx.run();

  expect(result.exitCode).toBe(0);

  expect(readFileSync(ctx.summaryPath, 'utf8')).toBe(
    'deploy/compose/config.yaml\ndeploy/kubernetes/config.yaml\n',
  );
});

test('it fails, naming the file, when the schema refuses the compose config', async () => {
  const ctx = setupTest();

  ctx.writeShipped('server: {}\ncomputer: {}\n', 'server: {}');

  const result = await ctx.run();

  expect(result.exitCode).toBe(1);

  expect(result.stdout.toString()).toBe(
    '::error::apps/server/config.schema.json refuses deploy/compose/config.yaml: the config must NOT have additional properties\n',
  );
});

test('it fails when the schema refuses the config inside the Kubernetes ConfigMap', async () => {
  const ctx = setupTest();

  ctx.writeShipped('server: {}\n', 'server: {}\ncode: {}');

  const result = await ctx.run();

  expect(result.exitCode).toBe(1);

  expect(result.stdout.toString()).toBe(
    '::error::apps/server/config.schema.json refuses deploy/kubernetes/config.yaml: the config must NOT have additional properties\n',
  );
});
