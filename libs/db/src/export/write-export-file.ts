import { Database } from 'bun:sqlite';
import { chmod, link, lstat, mkdtemp, open, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
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
// The file fills inside a directory that only its owner enters, and a hard link gives it its name,
// because a link fails on an existing path where a rename would replace it.
export async function writeExportFile(path: string, options: ExportFileOptions): Promise<number> {
  const exists = await probePathExists(path);

  if (exists) {
    throw new ExportPathExistsError(path);
  }

  const workDirectory = await mkdtemp(`${path}.partial-`);

  try {
    // an explicit mode, because a restrictive umask changes the one the directory was made with
    await chmod(workDirectory, 0o700);

    const partialPath = join(workDirectory, 'export.db');

    const created = await open(partialPath, 'wx', 0o600);

    try {
      await created.chmod(0o600);
    } finally {
      await created.close();
    }

    const count = await fillExportFile(partialPath, options);

    await link(partialPath, path).catch((error: unknown) => {
      throw isErrorWithCode(error, 'EEXIST') ? new ExportPathExistsError(path) : error;
    });

    await syncLinkedFile(path);

    return count;
  } finally {
    await rm(workDirectory, { recursive: true, force: true });
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

// A failed sync leaves no file at the path, so an error never hides a file that holds the log.
async function syncLinkedFile(path: string): Promise<void> {
  try {
    await syncPath(path);
    await syncPath(dirname(path));
  } catch (error) {
    await rm(path, { force: true });

    throw error;
  }
}

async function syncPath(path: string): Promise<void> {
  const handle = await open(path, 'r');

  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}
