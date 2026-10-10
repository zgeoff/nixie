import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

async function setupTest() {
  const dir = await mkdtemp(join(tmpdir(), 'nixie-oxlintrc-'));

  onTestFinished(() => rm(dir, { recursive: true, force: true }));

  // boot: the repo's own config is the unit under test, and its shared base resolves from the repo
  await Bun.file(join(import.meta.dir, '.oxlintrc.json'))
    .text()
    .then((config) =>
      Bun.write(
        join(dir, '.oxlintrc.json'),
        config.replaceAll('"./node_modules/', `"${join(import.meta.dir, 'node_modules')}/`),
      ),
    );

  return {
    dir,
    runLint: async (path: string) => {
      const oxlint = Bun.spawn([join(import.meta.dir, 'node_modules/.bin/oxlint'), path], {
        cwd: dir,
        env: { ...Bun.env, NO_COLOR: '1' },
      });

      return { stdout: await new Response(oxlint.stdout).text(), exitCode: await oxlint.exited };
    },
  };
}

test.each([
  {
    label: 'the Agent SDK',
    path: 'modules/tasks/src/index.ts',
    source: "export { query } from '@anthropic-ai/claude-agent-sdk';\n",
    help: 'Only guests/conversation imports the Agent SDK.',
  },
  {
    label: 'an Agent SDK subpath',
    path: 'guests/fetch/src/index.ts',
    source: "export { tool } from '@anthropic-ai/claude-agent-sdk/tools';\n",
    help: 'Only guests/conversation imports the Agent SDK.',
  },
  {
    label: "imp's client",
    path: 'modules/sandbox/src/index.ts',
    source: "export { ImpClient } from '@zgeoff/imp-client';\n",
    help: "Only adapters/sandbox-imp imports imp's client.",
  },
  {
    label: 'bun:sqlite',
    path: 'modules/log/src/index.ts',
    source: "export { Database } from 'bun:sqlite';\n",
    help: 'Only libs/db opens SQLite; use @heynixie/db.',
  },
  {
    label: 'bun:sqlite through a literal import()',
    path: 'libs/wire/src/index.ts',
    source: "export const sqlite = await import('bun:sqlite');\n",
    help: 'Only libs/db opens SQLite; use @heynixie/db.',
  },
])('it refuses $label in $path', async (row) => {
  const ctx = await setupTest();

  await Bun.write(join(ctx.dir, row.path), row.source);

  const result = await ctx.runLint(row.path);

  expect(result.exitCode).toBe(1);
  expect(result.stdout).toInclude('eslint(no-restricted-imports)');
  expect(result.stdout).toInclude(row.help);
});

test.each([
  {
    label: 'the Agent SDK',
    path: 'guests/conversation/src/index.ts',
    source: "export { query } from '@anthropic-ai/claude-agent-sdk';\n",
  },
  {
    label: "imp's client",
    path: 'adapters/sandbox-imp/src/index.ts',
    source: "export { ImpClient } from '@zgeoff/imp-client';\n",
  },
  {
    label: 'bun:sqlite',
    path: 'libs/db/src/index.ts',
    source: "export { Database } from 'bun:sqlite';\n",
  },
])('it allows $label in $path', async (row) => {
  const ctx = await setupTest();

  await Bun.write(join(ctx.dir, row.path), row.source);

  const result = await ctx.runLint(row.path);

  expect(result.exitCode).toBe(0);
  expect(result.stdout).toBe('');
});

test('it refuses an import() whose specifier is not a string literal', async () => {
  const ctx = await setupTest();

  await Bun.write(
    join(ctx.dir, 'modules/log/src/index.ts'),
    "const specifier = ['bun', 'sqlite'].join(':');\n\nexport const sqlite = await import(specifier);\n",
  );

  const result = await ctx.runLint('modules/log/src/index.ts');

  expect(result.exitCode).toBe(1);
  expect(result.stdout).toInclude('import(no-dynamic-require)');
});

test('it refuses require', async () => {
  const ctx = await setupTest();

  await Bun.write(
    join(ctx.dir, 'modules/log/src/index.ts'),
    "export const sqlite = require('bun:sqlite');\n",
  );

  const result = await ctx.runLint('modules/log/src/index.ts');

  expect(result.exitCode).toBe(1);
  expect(result.stdout).toInclude('import(no-commonjs)');
});
