import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import invariant from 'tiny-invariant';

// Lints a temp tree with the import rules from the repo's own .oxlintrc.json, so each boundary the
// config declares fails a real import.
async function setupTest() {
  const root = join(import.meta.dir, '..');

  const created = await mkdtemp(join(tmpdir(), 'nixie-import-zones-'));

  onTestFinished(() => rm(created, { recursive: true, force: true }));

  const dir = await realpath(created);
  const configText = await Bun.file(join(root, '.oxlintrc.json')).text();

  const repoConfig: unknown = Bun.JSONC.parse(configText);

  invariant(
    typeof repoConfig === 'object' &&
      repoConfig !== null &&
      'rules' in repoConfig &&
      typeof repoConfig.rules === 'object' &&
      repoConfig.rules !== null &&
      'zgeoff/import-zones' in repoConfig.rules &&
      'no-restricted-globals' in repoConfig.rules &&
      'nixie/no-hidden-import' in repoConfig.rules,
    '.oxlintrc.json configures each import rule',
  );

  const lintConfig = {
    jsPlugins: [
      join(root, 'node_modules', '@zgeoff', 'oxlint-config', 'plugin.js'),
      join(root, 'oxlint-plugin.js'),
    ],
    rules: {
      'zgeoff/import-zones': repoConfig.rules['zgeoff/import-zones'],
      'no-restricted-globals': repoConfig.rules['no-restricted-globals'],
      'nixie/no-hidden-import': repoConfig.rules['nixie/no-hidden-import'],
    },
  };

  // the zones root their globs at the nearest .git, so the tree is a repository of its own
  await mkdir(join(dir, '.git'));
  await writeFile(join(dir, '.oxlintrc.json'), JSON.stringify(lintConfig));
  await writeFile(join(dir, 'package.json'), JSON.stringify({ name: 'nixie' }));

  return {
    dir,
    lint: async (target: string) => {
      const args = [
        join(root, 'node_modules', '.bin', 'oxlint'),
        '-c',
        '.oxlintrc.json',

        // under GITHUB_ACTIONS oxlint would print annotations instead
        '--format',
        'default',
        target,
      ];

      const proc = Bun.spawn(args, { cwd: dir, stdout: 'pipe', stderr: 'pipe' });

      const [exitCode, stdout] = await Promise.all([proc.exited, new Response(proc.stdout).text()]);

      return { exitCode, stdout };
    },
  };
}

test.each([
  {
    report: 'zgeoff(import-zones): agent-sdk: ',
    file: 'modules/sessions/src/run-turn.ts',
    source: "import { query } from '@anthropic-ai/claude-agent-sdk';\n",
  },
  {
    report: 'zgeoff(import-zones): agent-sdk: ',
    file: 'modules/sessions/src/run-turn.ts',
    source: "import type { Options } from '@anthropic-ai/claude-agent-sdk';\n",
  },
  {
    report: 'zgeoff(import-zones): agent-sdk: ',
    file: 'apps/server/src/start-server.ts',
    source: "import type { Tool } from '@anthropic-ai/claude-agent-sdk/sdk-tools';\n",
  },
  {
    report: 'zgeoff(import-zones): imp-client: ',
    file: 'libs/db/src/open-database.ts',
    source: "import { createClient } from '@zgeoff/imp-client';\n",
  },
  {
    report: 'zgeoff(import-zones): imp-client: ',
    file: 'guests/conversation/src/run-query.ts',
    source: "import { createClient } from '@zgeoff/imp-client/client';\n",
  },
  {
    report: 'zgeoff(import-zones): sqlite: ',
    file: 'modules/memory/src/read-memories.ts',
    source: "import { Database } from 'bun:sqlite';\n",
  },
  {
    report: 'zgeoff(import-zones): sqlite: ',
    file: 'adapters/sandbox-imp/src/start-sandbox.ts',
    source: "const sqlite = await import('bun:sqlite');\n",
  },
  {
    report: 'zgeoff(import-zones): create-require: ',
    file: 'libs/db/src/open-database.ts',
    source: "import { createRequire } from 'node:module';\n",
  },
  {
    report: 'zgeoff(import-zones): create-require: ',
    file: 'modules/memory/src/read-memories.ts',
    source: "import { createRequire } from 'module';\n",
  },
  {
    report: 'zgeoff(import-zones): unresolved: cannot check a computed import specifier',
    file: 'modules/memory/src/read-memories.ts',
    source: "const name = process.argv[2] ?? 'sqlite';\nawait import(name);\n",
  },
  {
    report: 'zgeoff(import-zones): unresolved: cannot check a computed import specifier',
    file: 'modules/memory/src/read-memories.ts',
    source: "const name = process.argv[2] ?? 'sqlite';\nawait import('bun:' + name);\n",
  },
  {
    report: 'eslint(no-restricted-globals): ',
    file: 'modules/memory/src/read-memories.ts',
    source: "const load = require;\nload('bun:sqlite');\n",
  },
  {
    report: 'nixie(no-hidden-import): ',
    file: 'modules/memory/src/read-memories.ts',
    source: "import.meta.require('bun:sqlite');\n",
  },
])(
  'it fails lint on $source in $file',
  async (row) => {
    const ctx = await setupTest();

    await Bun.write(join(ctx.dir, row.file), row.source);

    const result = await ctx.lint(row.file);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toInclude(row.report);
  },
  30_000,
);

test.each([
  {
    file: 'guests/conversation/src/run-query.ts',
    source: "import { query } from '@anthropic-ai/claude-agent-sdk';\n",
  },
  {
    file: 'evals/sdk-contract/tool-calls.test.ts',
    source: "import { query } from '@anthropic-ai/claude-agent-sdk';\n",
  },
  {
    file: 'evals/test-utils/run-contract-query.ts',
    source: "import { query } from '@anthropic-ai/claude-agent-sdk';\n",
  },
  {
    file: 'adapters/sandbox-imp/src/start-sandbox.ts',
    source: "import { createClient } from '@zgeoff/imp-client';\n",
  },
  {
    file: 'libs/db/src/open-database.ts',
    source: "import { Database } from 'bun:sqlite';\n",
  },
  {
    file: 'modules/memory/src/read-memories.ts',
    source: 'await import(`@heynixie/db`);\n',
  },
])(
  'it passes $source in $file',
  async (row) => {
    const ctx = await setupTest();

    await Bun.write(join(ctx.dir, row.file), row.source);

    const result = await ctx.lint(row.file);

    expect(result.exitCode).toBe(0);
  },
  30_000,
);
