import { Database } from 'bun:sqlite';
import { constants } from 'node:fs';
import type { FileHandle } from 'node:fs/promises';
import { chmod, mkdtemp, open, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
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
// The export is built in a private directory of its own and copied through the descriptor of a
// destination made exclusively, so no other account reaches it by path. A failure removes the file.
export async function writeExportFile(path: string, options: ExportFileOptions): Promise<number> {
  const destination = await openDestination(path);

  try {
    // an explicit mode, because a restrictive umask changes the one the file was made with
    await destination.chmod(0o600);

    const count = await writeStagedExport(destination, options);

    await destination.sync();
    await destination.close();

    await syncPath(dirname(path));

    return count;
  } catch (error) {
    await destination.close().catch(() => null);

    await rm(path, { force: true });

    throw error;
  }
}

async function openDestination(path: string): Promise<FileHandle> {
  const flags = constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW;

  try {
    return await open(path, flags, 0o600);
  } catch (error) {
    throw isErrorWithCode(error, 'EEXIST') ? new ExportPathExistsError(path) : error;
  }
}

function isErrorWithCode(error: unknown, code: string): boolean {
  return error instanceof Error && 'code' in error && error.code === code;
}

async function writeStagedExport(
  destination: FileHandle,
  options: ExportFileOptions,
): Promise<number> {
  const stagingDirectory = await mkdtemp(join(tmpdir(), 'nixie-export-'));

  try {
    // an explicit mode, because a restrictive umask changes the one the directory was made with
    await chmod(stagingDirectory, 0o700);

    const stagedPath = join(stagingDirectory, 'export.db');

    const count = await writeExportTable(stagedPath, options);

    await copyInto(destination, stagedPath);

    return count;
  } finally {
    await rm(stagingDirectory, { recursive: true, force: true });
  }
}

async function writeExportTable(path: string, options: ExportFileOptions): Promise<number> {
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

const COPY_CHUNK_BYTES = 1024 * 1024;

async function copyInto(destination: FileHandle, sourcePath: string): Promise<void> {
  const source = await open(sourcePath, 'r');

  try {
    const buffer = Buffer.alloc(COPY_CHUNK_BYTES);

    for (;;) {
      const result = await source.read(buffer, 0, buffer.length, null);

      if (result.bytesRead === 0) {
        return;
      }

      await destination.write(buffer, 0, result.bytesRead);
    }
  } finally {
    await source.close();
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
