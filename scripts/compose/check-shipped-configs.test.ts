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

  return {
    summaryPath,
    writeFile: (path: string, text: string) => {
      writeFileSync(join(directory, path), text);
    },
    run: (releasesURL: string) =>
      $`${process.execPath} ${join(import.meta.dir, 'check-shipped-configs.ts')}`
        .cwd(directory)
        .env({ ...process.env, GITHUB_STEP_SUMMARY: summaryPath, RELEASES_URL: releasesURL })
        .nothrow()
        .quiet(),
  };
}

test('it lists each shipped config with its pinned release when that release accepts it', async () => {
  const ctx = setupTest();

  const server = Bun.serve({
    port: 0,
    routes: {
      '/releases/download/v0.7.2/config.schema.json': Response.json({
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        type: 'object',
        properties: { server: { type: 'object' } },
        additionalProperties: false,
      }),
      '/releases/download/v0.6.0/config.schema.json': Response.json({
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        type: 'object',
        properties: { server: { type: 'object' } },
        additionalProperties: false,
      }),
    },
  });

  onTestFinished(() => server.stop(true));

  ctx.writeFile(
    'deploy/compose/compose.yaml',
    `services:\n  nixie:\n    image: ghcr.io/zgeoff/nixie:0.7.2@sha256:${'a'.repeat(64)}\n`,
  );

  ctx.writeFile('deploy/compose/config.yaml', 'server: {}\n');

  ctx.writeFile(
    'deploy/kubernetes/nixie.yaml',
    `spec:\n  containers:\n    - image: ghcr.io/zgeoff/nixie:0.6.0@sha256:${'b'.repeat(64)}\n`,
  );

  ctx.writeFile(
    'deploy/kubernetes/config.yaml',
    'kind: ConfigMap\ndata:\n  config.yaml: |\n    server: {}\n---\nkind: ConfigMap\ndata:\n  other: value\n',
  );

  const result = await ctx.run(`${server.url.origin}/releases/download`);

  expect({
    exitCode: result.exitCode,
    summary: readFileSync(ctx.summaryPath, 'utf8'),
  }).toStrictEqual({
    exitCode: 0,
    summary:
      'deploy/compose/config.yaml against v0.7.2\ndeploy/kubernetes/config.yaml against v0.6.0\n',
  });
});

test('it fails, naming the release and the file, when the pinned release refuses a section the checkout accepts', async () => {
  const ctx = setupTest();

  const server = Bun.serve({
    port: 0,
    routes: {
      '/v0.7.2/config.schema.json': Response.json({
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        type: 'object',
        properties: { server: { type: 'object' } },
        additionalProperties: false,
      }),
    },
  });

  onTestFinished(() => server.stop(true));

  ctx.writeFile(
    'apps/server/config.schema.json',
    JSON.stringify({
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      properties: { server: { type: 'object' }, code: { type: 'object' } },
      additionalProperties: false,
    }),
  );

  ctx.writeFile(
    'deploy/compose/compose.yaml',
    `services:\n  nixie:\n    image: ghcr.io/zgeoff/nixie:0.7.2@sha256:${'a'.repeat(64)}\n`,
  );

  ctx.writeFile('deploy/compose/config.yaml', 'server: {}\ncode: {}\n');

  ctx.writeFile(
    'deploy/kubernetes/nixie.yaml',
    `spec:\n  containers:\n    - image: ghcr.io/zgeoff/nixie:0.7.2@sha256:${'a'.repeat(64)}\n`,
  );

  ctx.writeFile(
    'deploy/kubernetes/config.yaml',
    'kind: ConfigMap\ndata:\n  config.yaml: |\n    server: {}\n',
  );

  const result = await ctx.run(server.url.origin);

  expect({ exitCode: result.exitCode, stdout: result.stdout.toString() }).toStrictEqual({
    exitCode: 1,
    stdout:
      '::error::the v0.7.2 config schema refuses deploy/compose/config.yaml: the config must NOT have additional properties\n',
  });
});

test('it fails, naming the URL, when the pinned release publishes no config schema', async () => {
  const ctx = setupTest();

  const server = Bun.serve({
    port: 0,
    routes: { '/v0.6.0/config.schema.json': Response.json({}) },
  });

  onTestFinished(() => server.stop(true));

  ctx.writeFile(
    'deploy/compose/compose.yaml',
    `services:\n  nixie:\n    image: ghcr.io/zgeoff/nixie:0.7.2@sha256:${'a'.repeat(64)}\n`,
  );

  ctx.writeFile('deploy/compose/config.yaml', 'server: {}\n');

  const result = await ctx.run(server.url.origin);

  expect({ exitCode: result.exitCode, stdout: result.stdout.toString() }).toStrictEqual({
    exitCode: 1,
    stdout: `::error::${server.url.origin}/v0.7.2/config.schema.json answered 404\n`,
  });
});

test('it fails, naming the recipe, when the recipe pins no one nixie release', async () => {
  const ctx = setupTest();

  ctx.writeFile(
    'deploy/compose/compose.yaml',
    [
      'services:',
      '  setup:',
      `    image: ghcr.io/zgeoff/nixie:0.7.2@sha256:${'a'.repeat(64)}`,
      '  nixie:',
      `    image: ghcr.io/zgeoff/nixie:0.8.0@sha256:${'c'.repeat(64)}`,
      '',
    ].join('\n'),
  );

  ctx.writeFile('deploy/compose/config.yaml', 'server: {}\n');

  const result = await ctx.run('http://127.0.0.1:9');

  expect({ exitCode: result.exitCode, stdout: result.stdout.toString() }).toStrictEqual({
    exitCode: 1,
    stdout: '::error::deploy/compose/compose.yaml pins more than one nixie release: 0.7.2, 0.8.0\n',
  });
});
