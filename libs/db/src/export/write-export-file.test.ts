import { Database } from 'bun:sqlite';
import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ExportPathExistsError } from './export-path-exists-error';
import { writeExportFile } from './write-export-file';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'nixie-export-file-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return {
    path: join(directory, 'out.db'),
    directory,
    write: (path: string, rows: Iterable<readonly (string | number | null)[]>) =>
      writeExportFile(path, {
        table: 'notes',
        columns: [
          { name: 'id', type: 'integer' },
          { name: 'text', type: 'text' },
        ],
        rows,
      }),
    rows: [
      [1, 'alpha'],
      [2, null],
    ] as const,
    failRows: {
      [Symbol.iterator]: (): Iterator<readonly (string | number)[]> => {
        throw new Error('read failed');
      },
    },
  };
}

test('it writes every row into a table that a reader of the file opens', async () => {
  const ctx = await setupTest();
  const count = await ctx.write(ctx.path, ctx.rows);

  const reader = new Database(ctx.path, { readonly: true });

  onTestFinished(() => {
    reader.close();
  });

  expect(count).toBe(2);

  expect(reader.query('select id, text from notes order by id').all()).toStrictEqual([
    { id: 1, text: 'alpha' },
    { id: 2, text: null },
  ]);
});

test('it makes a file that only its owner reads and leaves no partial file', async () => {
  const ctx = await setupTest();

  await ctx.write(ctx.path, ctx.rows);

  const info = await stat(ctx.path);
  const names = await readdir(ctx.directory);

  expect(info.mode & 0o777).toBe(0o600);
  expect(names).toStrictEqual(['out.db']);
});

test('it refuses a path that exists and leaves the file as it was', async () => {
  const ctx = await setupTest();

  await writeFile(ctx.path, 'precious');

  const write = ctx.write(ctx.path, ctx.rows);

  await Promise.allSettled([write]);

  const text = await Bun.file(ctx.path).text();
  const names = await readdir(ctx.directory);

  expect(write).rejects.toBeInstanceOf(ExportPathExistsError);
  expect(text).toBe('precious');
  expect(names).toStrictEqual(['out.db']);
});

test('it removes the partial file when the rows fail', async () => {
  const ctx = await setupTest();

  const write = ctx.write(ctx.path, ctx.failRows);

  await Promise.allSettled([write]);

  const names = await readdir(ctx.directory);

  expect(write).rejects.toThrow('read failed');
  expect(names).toStrictEqual([]);
});
