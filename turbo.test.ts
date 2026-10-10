import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

async function setupTest() {
  const dir = await mkdtemp(join(tmpdir(), 'nixie-boundaries-'));

  onTestFinished(() => rm(dir, { recursive: true, force: true }));

  // boot: turbo finds the workspace packages through the root manifest's globs
  await Bun.write(
    join(dir, 'package.json'),
    JSON.stringify({
      name: 'boundaries-fixture',
      private: true,
      packageManager: 'bun@1.4.2',
      workspaces: ['apps/*', 'modules/*', 'guests/*', 'adapters/*', 'libs/*'],
    }),
  );

  // boot: the repo's own tag rules are the unit under test
  const rules = Bun.file(join(import.meta.dir, 'turbo.json'));

  await Bun.write(join(dir, 'turbo.json'), rules);

  return {
    dir,
    runBoundaries: async () => {
      const turbo = Bun.spawn([join(import.meta.dir, 'node_modules/.bin/turbo'), 'boundaries'], {
        cwd: dir,
        env: { ...Bun.env, TURBO_TELEMETRY_DISABLED: '1', NO_COLOR: '1' },
        stdout: 'ignore',
        stderr: 'pipe',
      });

      return { stderr: await new Response(turbo.stderr).text(), exitCode: await turbo.exited };
    },
  };
}

test('it refuses a guest that depends on a module', async () => {
  const ctx = await setupTest();

  await Promise.all([
    Bun.write(
      join(ctx.dir, 'modules/log/package.json'),
      JSON.stringify({ name: '@heynixie/log', private: true, exports: { '.': './src/index.ts' } }),
    ),
    Bun.write(
      join(ctx.dir, 'modules/log/turbo.json'),
      JSON.stringify({ extends: ['//'], tags: ['module'] }),
    ),
    Bun.write(join(ctx.dir, 'modules/log/src/index.ts'), 'export const log = 1;\n'),
    Bun.write(
      join(ctx.dir, 'guests/conversation/package.json'),
      JSON.stringify({
        name: '@heynixie/conversation',
        private: true,
        exports: { '.': './src/index.ts' },
        dependencies: { '@heynixie/log': 'workspace:*' },
      }),
    ),
    Bun.write(
      join(ctx.dir, 'guests/conversation/turbo.json'),
      JSON.stringify({ extends: ['//'], tags: ['guest'] }),
    ),
    Bun.write(
      join(ctx.dir, 'guests/conversation/src/index.ts'),
      "import { log } from '@heynixie/log';\n\nexport const turn = log;\n",
    ),
  ]);

  const result = await ctx.runBoundaries();

  expect(result.exitCode).toBe(1);
  expect(result.stderr).toInclude(
    'Package `@heynixie/log` found without any tag listed in allowlist',
  );
});

test('it refuses a guest that declares a server-only lib', async () => {
  const ctx = await setupTest();

  await Promise.all([
    Bun.write(
      join(ctx.dir, 'libs/db/package.json'),
      JSON.stringify({ name: '@heynixie/db', private: true, exports: { '.': './src/index.ts' } }),
    ),
    Bun.write(
      join(ctx.dir, 'libs/db/turbo.json'),
      JSON.stringify({ extends: ['//'], tags: ['lib', 'server-only'] }),
    ),
    Bun.write(
      join(ctx.dir, 'guests/conversation/package.json'),
      JSON.stringify({
        name: '@heynixie/conversation',
        private: true,
        exports: { '.': './src/index.ts' },
        dependencies: { '@heynixie/db': 'workspace:*' },
      }),
    ),
    Bun.write(
      join(ctx.dir, 'guests/conversation/turbo.json'),
      JSON.stringify({ extends: ['//'], tags: ['guest'] }),
    ),
  ]);

  const result = await ctx.runBoundaries();

  expect(result.exitCode).toBe(1);
  expect(result.stderr).toInclude(
    'Package `@heynixie/conversation` found without any tag listed in allowlist',
  );
});

test('it refuses a lib without server-only that declares a server-only lib', async () => {
  const ctx = await setupTest();

  await Promise.all([
    Bun.write(
      join(ctx.dir, 'libs/db/package.json'),
      JSON.stringify({ name: '@heynixie/db', private: true, exports: { '.': './src/index.ts' } }),
    ),
    Bun.write(
      join(ctx.dir, 'libs/db/turbo.json'),
      JSON.stringify({ extends: ['//'], tags: ['lib', 'server-only'] }),
    ),
    Bun.write(
      join(ctx.dir, 'libs/wire/package.json'),
      JSON.stringify({
        name: '@heynixie/wire',
        private: true,
        exports: { '.': './src/index.ts' },
        dependencies: { '@heynixie/db': 'workspace:*' },
      }),
    ),
    Bun.write(
      join(ctx.dir, 'libs/wire/turbo.json'),
      JSON.stringify({ extends: ['//'], tags: ['lib'] }),
    ),
  ]);

  const result = await ctx.runBoundaries();

  expect(result.exitCode).toBe(1);
  expect(result.stderr).toInclude(
    'Package `@heynixie/wire` found without any tag listed in allowlist',
  );
});

test('it accepts a module that depends on another module and a server-only lib', async () => {
  const ctx = await setupTest();

  await Promise.all([
    Bun.write(
      join(ctx.dir, 'libs/db/package.json'),
      JSON.stringify({ name: '@heynixie/db', private: true, exports: { '.': './src/index.ts' } }),
    ),
    Bun.write(
      join(ctx.dir, 'libs/db/turbo.json'),
      JSON.stringify({ extends: ['//'], tags: ['lib', 'server-only'] }),
    ),
    Bun.write(join(ctx.dir, 'libs/db/src/index.ts'), 'export const db = 1;\n'),
    Bun.write(
      join(ctx.dir, 'modules/log/package.json'),
      JSON.stringify({ name: '@heynixie/log', private: true, exports: { '.': './src/index.ts' } }),
    ),
    Bun.write(
      join(ctx.dir, 'modules/log/turbo.json'),
      JSON.stringify({ extends: ['//'], tags: ['module'] }),
    ),
    Bun.write(join(ctx.dir, 'modules/log/src/index.ts'), 'export const log = 1;\n'),
    Bun.write(
      join(ctx.dir, 'modules/tasks/package.json'),
      JSON.stringify({
        name: '@heynixie/tasks',
        private: true,
        exports: { '.': './src/index.ts' },
        dependencies: { '@heynixie/db': 'workspace:*', '@heynixie/log': 'workspace:*' },
      }),
    ),
    Bun.write(
      join(ctx.dir, 'modules/tasks/turbo.json'),
      JSON.stringify({ extends: ['//'], tags: ['module'] }),
    ),
    Bun.write(
      join(ctx.dir, 'modules/tasks/src/index.ts'),
      "import { db } from '@heynixie/db';\nimport { log } from '@heynixie/log';\n\nexport const tasks = [db, log];\n",
    ),
  ]);

  const result = await ctx.runBoundaries();

  expect(result.exitCode).toBe(0);
});

test('it accepts a guest that depends on a lib without server-only', async () => {
  const ctx = await setupTest();

  await Promise.all([
    Bun.write(
      join(ctx.dir, 'libs/wire/package.json'),
      JSON.stringify({ name: '@heynixie/wire', private: true, exports: { '.': './src/index.ts' } }),
    ),
    Bun.write(
      join(ctx.dir, 'libs/wire/turbo.json'),
      JSON.stringify({ extends: ['//'], tags: ['lib'] }),
    ),
    Bun.write(join(ctx.dir, 'libs/wire/src/index.ts'), 'export const wire = 1;\n'),
    Bun.write(
      join(ctx.dir, 'guests/conversation/package.json'),
      JSON.stringify({
        name: '@heynixie/conversation',
        private: true,
        exports: { '.': './src/index.ts' },
        dependencies: { '@heynixie/wire': 'workspace:*' },
      }),
    ),
    Bun.write(
      join(ctx.dir, 'guests/conversation/turbo.json'),
      JSON.stringify({ extends: ['//'], tags: ['guest'] }),
    ),
    Bun.write(
      join(ctx.dir, 'guests/conversation/src/index.ts'),
      "import { wire } from '@heynixie/wire';\n\nexport const turn = wire;\n",
    ),
  ]);

  const result = await ctx.runBoundaries();

  expect(result.exitCode).toBe(0);
});

test('it refuses an import of a workspace package the importer does not declare', async () => {
  const ctx = await setupTest();

  await Promise.all([
    Bun.write(
      join(ctx.dir, 'libs/wire/package.json'),
      JSON.stringify({ name: '@heynixie/wire', private: true, exports: { '.': './src/index.ts' } }),
    ),
    Bun.write(
      join(ctx.dir, 'libs/wire/turbo.json'),
      JSON.stringify({ extends: ['//'], tags: ['lib'] }),
    ),
    Bun.write(join(ctx.dir, 'libs/wire/src/index.ts'), 'export const wire = 1;\n'),
    Bun.write(
      join(ctx.dir, 'modules/log/package.json'),
      JSON.stringify({ name: '@heynixie/log', private: true, exports: { '.': './src/index.ts' } }),
    ),
    Bun.write(
      join(ctx.dir, 'modules/log/turbo.json'),
      JSON.stringify({ extends: ['//'], tags: ['module'] }),
    ),
    Bun.write(
      join(ctx.dir, 'modules/log/src/index.ts'),
      "import { wire } from '@heynixie/wire';\n\nexport const log = wire;\n",
    ),
  ]);

  const result = await ctx.runBoundaries();

  expect(result.exitCode).toBe(1);
  expect(result.stderr).toInclude(
    'cannot import package `@heynixie/wire` because it is not a dependency',
  );
});

test('it refuses a relative import into another package', async () => {
  const ctx = await setupTest();

  await Promise.all([
    Bun.write(
      join(ctx.dir, 'libs/wire/package.json'),
      JSON.stringify({ name: '@heynixie/wire', private: true, exports: { '.': './src/index.ts' } }),
    ),
    Bun.write(
      join(ctx.dir, 'libs/wire/turbo.json'),
      JSON.stringify({ extends: ['//'], tags: ['lib'] }),
    ),
    Bun.write(join(ctx.dir, 'libs/wire/src/frame.ts'), 'export const frame = 1;\n'),
    Bun.write(
      join(ctx.dir, 'modules/log/package.json'),
      JSON.stringify({ name: '@heynixie/log', private: true, exports: { '.': './src/index.ts' } }),
    ),
    Bun.write(
      join(ctx.dir, 'modules/log/turbo.json'),
      JSON.stringify({ extends: ['//'], tags: ['module'] }),
    ),
    Bun.write(
      join(ctx.dir, 'modules/log/src/index.ts'),
      "import { frame } from '../../../libs/wire/src/frame.ts';\n\nexport const log = frame;\n",
    ),
  ]);

  const result = await ctx.runBoundaries();

  expect(result.exitCode).toBe(1);
  expect(result.stderr).toInclude('import `../../../libs/wire/src/frame.ts` leaves the package');
});

test('it refuses a cycle between modules', async () => {
  const ctx = await setupTest();

  await Promise.all([
    Bun.write(
      join(ctx.dir, 'modules/log/package.json'),
      JSON.stringify({
        name: '@heynixie/log',
        private: true,
        exports: { '.': './src/index.ts' },
        dependencies: { '@heynixie/tasks': 'workspace:*' },
      }),
    ),
    Bun.write(
      join(ctx.dir, 'modules/log/turbo.json'),
      JSON.stringify({ extends: ['//'], tags: ['module'] }),
    ),
    Bun.write(
      join(ctx.dir, 'modules/tasks/package.json'),
      JSON.stringify({
        name: '@heynixie/tasks',
        private: true,
        exports: { '.': './src/index.ts' },
        dependencies: { '@heynixie/log': 'workspace:*' },
      }),
    ),
    Bun.write(
      join(ctx.dir, 'modules/tasks/turbo.json'),
      JSON.stringify({ extends: ['//'], tags: ['module'] }),
    ),
  ]);

  const result = await ctx.runBoundaries();

  expect(result.exitCode).toBe(1);
  expect(result.stderr).toInclude('Circular package dependency detected');
});
