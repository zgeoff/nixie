import { Database } from 'bun:sqlite';
import { link, lstat, open, rm } from 'node:fs/promises';
import { dirname } from 'node:path';
import { ExportPathExistsError } from './export-path-exists-error';

export interface ExportColumn {
  readonly name: string;
  readonly type: 'integer' | 'text';
}

export type ExportValue = string | number | null;

export interface ExportFileOptions {
  readonly table: string;
  readonly columns: readonly ExportColumn[];

  // the first column is the table's primary key
  readonly rows: Readonly<AsyncIterable<readonly ExportValue[]> | Iterable<readonly ExportValue[]>>;
}

// Writes the rows into a new SQLite file that only its owner reads, and refuses a path that exists.
// A hard link gives the finished partial file its name, because a link fails on an existing path
// where a rename would replace it.
export async function writeExportFile(path: string, options: ExportFileOptions): Promise<number> {
  const partialPath = `${path}.partial`;

  const exists = await probePathExists(path);

  if (exists) {
    throw new ExportPathExistsError(path);
  }

  const created = await open(partialPath, 'wx', 0o600);

  await created.close();

  try {
    const count = await fillExportFile(partialPath, options);

    await link(partialPath, path).catch((error: unknown) => {
      throw isErrorWithCode(error, 'EEXIST') ? new ExportPathExistsError(path) : error;
    });

    await syncPath(path);
    await syncPath(dirname(path));

    return count;
  } finally {
    await rm(partialPath, { force: true });
  }
}

async function probePathExists(path: string): Promise<boolean> {
  try {
    await lstat(path);

    return true;
  } catch (error) {
    if (isErrorWithCode(error, 'ENOENT')) {
      return false;
    }

    throw error;
  }
}

function isErrorWithCode(error: unknown, code: string): boolean {
  return error instanceof Error && 'code' in error && error.code === code;
}

async function fillExportFile(path: string, options: ExportFileOptions): Promise<number> {
  const db = new Database(path);

  try {
    db.run('pragma journal_mode = off');

    const [primary, ...rest] = options.columns;

    const definitions = [
      `${quote(primary?.name ?? '')} ${primary?.type ?? 'text'} primary key`,
      ...rest.map((column) => `${quote(column.name)} ${column.type}`),
    ].join(', ');

    db.run(`create table ${quote(options.table)} (${definitions})`);

    const insert = db.prepare(
      `insert into ${quote(options.table)} values (${options.columns.map(() => '?').join(', ')})`,
    );

    db.run('begin');

    let count = 0;

    for await (const row of options.rows) {
      insert.run(...row);

      count += 1;
    }

    db.run('commit');

    return count;
  } finally {
    db.close();
  }
}

function quote(name: string): string {
  return `"${name.replaceAll('"', '""')}"`;
}

async function syncPath(path: string): Promise<void> {
  const handle = await open(path, 'r');

  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}
