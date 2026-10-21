import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'nixie-checked-tables-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  await writeFile(
    join(directory, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        strict: true,
        noEmit: true,
        module: 'preserve',
        moduleResolution: 'bundler',
        target: 'esnext',
        skipLibCheck: true,
        types: [],

        paths: { kysely: [Bun.resolveSync('kysely', import.meta.dir).replace(/\.js$/u, '.d.ts')] },
      },
      files: ['tables.ts'],
    }),
  );

  return {
    directory,
    tsc: join(import.meta.dir, '..', '..', '..', 'node_modules', '.bin', 'tsc'),
    imports: [
      `import type { CheckedTables } from '${join(import.meta.dir, 'checked-tables')}';`,
      `import type { NixieTables } from '${join(import.meta.dir, 'nixie-tables')}';`,
    ].join('\n'),
  };
}

test('it accepts a table map that matches the migrations column for column', async () => {
  const ctx = await setupTest();

  await writeFile(
    join(ctx.directory, 'tables.ts'),
    `${ctx.imports}
import type { Generated } from 'kysely';
export type Tables = CheckedTables<{
  records: Omit<NixieTables['records'], 'sequence' | 'kind'> & {
    readonly sequence: Generated<number>;
    readonly kind: 'note' | 'reply';
  };
}>;
`,
  );

  const result = Bun.spawnSync([ctx.tsc, '-p', ctx.directory]);

  expect(result.stdout.toString()).toBe('');
  expect(result.exitCode).toBe(0);
});

test('it rejects a table map that leaves out a column the migrations build', async () => {
  const ctx = await setupTest();

  await writeFile(
    join(ctx.directory, 'tables.ts'),
    `${ctx.imports}
export type Tables = CheckedTables<{ records: Omit<NixieTables['records'], 'kind'> }>;
`,
  );

  const result = Bun.spawnSync([ctx.tsc, '-p', ctx.directory]);

  expect(result.stdout.toString()).toInclude("Property 'kind' is missing");
  expect(result.exitCode).toBe(1);
});

test('it accepts a view that leaves out columns of a table it names in Views', async () => {
  const ctx = await setupTest();

  await writeFile(
    join(ctx.directory, 'tables.ts'),
    `${ctx.imports}
export type Tables = CheckedTables<{ records: Pick<NixieTables['records'], 'sequence'> }, 'records'>;
`,
  );

  const result = Bun.spawnSync([ctx.tsc, '-p', ctx.directory]);

  expect(result.stdout.toString()).toBe('');
  expect(result.exitCode).toBe(0);
});

test('it rejects a column that no migration creates', async () => {
  const ctx = await setupTest();

  await writeFile(
    join(ctx.directory, 'tables.ts'),
    `${ctx.imports}
export type Tables = CheckedTables<
  { records: Pick<NixieTables['records'], 'sequence'> & { readonly mood: string } },
  'records'
>;
`,
  );

  const result = Bun.spawnSync([ctx.tsc, '-p', ctx.directory]);

  expect(result.stdout.toString()).toInclude(
    `Type 'string' is not assignable to type '"no migration creates this column"'`,
  );

  expect(result.exitCode).toBe(1);
});

test('it rejects a table that no migration creates', async () => {
  const ctx = await setupTest();

  await writeFile(
    join(ctx.directory, 'tables.ts'),
    `${ctx.imports}
export type Tables = CheckedTables<{ garden_beds: { readonly bed_id: string } }>;
`,
  );

  const result = Bun.spawnSync([ctx.tsc, '-p', ctx.directory]);

  expect(result.stdout.toString()).toInclude(`'"no migration creates this table"'`);
  expect(result.exitCode).toBe(1);
});

test('it rejects a column declared not null that the migration lets hold null', async () => {
  const ctx = await setupTest();

  await writeFile(
    join(ctx.directory, 'tables.ts'),
    `${ctx.imports}
export type Tables = CheckedTables<
  { records: Pick<NixieTables['records'], 'sequence'> & { readonly thread: string } },
  'records'
>;
`,
  );

  const result = Bun.spawnSync([ctx.tsc, '-p', ctx.directory]);

  expect(result.stdout.toString()).toInclude(
    `Type 'string' is not assignable to type '"the migration lets this column hold null"'`,
  );

  expect(result.exitCode).toBe(1);
});

test('it rejects a column type that the driver never reads for the column', async () => {
  const ctx = await setupTest();

  await writeFile(
    join(ctx.directory, 'tables.ts'),
    `${ctx.imports}
export type Tables = CheckedTables<
  { records: Pick<NixieTables['records'], 'sequence'> & { readonly kind: number } },
  'records'
>;
`,
  );

  const result = Bun.spawnSync([ctx.tsc, '-p', ctx.directory]);

  expect(result.stdout.toString()).toInclude(
    `Type 'number' is not assignable to type '"the migration gives this column another type"'`,
  );

  expect(result.exitCode).toBe(1);
});

test('it rejects null in a column that the migration declares not null', async () => {
  const ctx = await setupTest();

  await writeFile(
    join(ctx.directory, 'tables.ts'),
    `${ctx.imports}
export type Tables = CheckedTables<
  { records: Pick<NixieTables['records'], 'sequence'> & { readonly kind: string | null } },
  'records'
>;
`,
  );

  const result = Bun.spawnSync([ctx.tsc, '-p', ctx.directory]);

  expect(result.stdout.toString()).toInclude(`'"the migration gives this column another type"'`);
  expect(result.exitCode).toBe(1);
});
