import { lstat, readdir, realpath } from 'node:fs/promises';
import { basename, join, relative, resolve, sep } from 'node:path';
import { buildContentHash } from './build-content-hash';
import { defaultSizeLimits } from './default-size-limits';
import { isDefinitionsPath } from './is-definitions-path';
import { isDefinitionsRootEntry } from './is-definitions-root-entry';
import { readGitCheckout } from './read-git-checkout';
import { readKeptFile } from './read-kept-file';
import { SnapshotError } from './snapshot-error';
import type { DefinitionsSource, SizeLimits, Snapshot } from './types';

export interface PathSourceOptions {
  readonly directory: string;
  readonly limits?: SizeLimits;
}

export function createPathSource(options: PathSourceOptions): DefinitionsSource {
  const limits = options.limits ?? defaultSizeLimits;

  return {
    id: `path:${resolve(options.directory)}`,
    kind: 'path',
    probe: async () => {
      const snapshot = await readPathSnapshot(options.directory, limits);

      return snapshot.revision === snapshot.contentHash
        ? snapshot.contentHash
        : JSON.stringify([snapshot.revision, snapshot.contentHash, snapshot.repository]);
    },
    snapshot: () => readPathSnapshot(options.directory, limits),
  };
}

async function readPathSnapshot(directory: string, limits: SizeLimits): Promise<Snapshot> {
  const base = await realpath(directory);
  const entries = await readEntries(base, base);

  if (entries.escapes.length > 0) {
    throw new SnapshotError('a symlink leads outside the definitions root', entries.escapes);
  }

  requireFileLimit(entries.files, limits.maxFileBytes);
  requireTotalLimit(entries.files, limits.maxTotalBytes);

  const files = await readFiles(base, entries.files, limits.maxFileBytes);

  const contentHash = buildContentHash(files);

  const checkout = await readGitCheckout(base);

  return {
    contentHash,
    files,
    revision: checkout?.commit ?? contentHash,
    repository: checkout?.repository ?? null,
    skipped: entries.skipped.toSorted(),
  };
}

interface WalkFile {
  readonly path: string;
  readonly size: number;
}

interface WalkEntries {
  readonly files: readonly WalkFile[];
  readonly skipped: readonly string[];
  readonly escapes: readonly string[];
}

async function readEntries(base: string, directory: string): Promise<WalkEntries> {
  const names = await readdir(directory);

  const entries = await Promise.all(
    names.toSorted().map((name) => readEntry(base, join(directory, name))),
  );

  return {
    files: entries.flatMap((entry) => entry.files),
    skipped: entries.flatMap((entry) => entry.skipped),
    escapes: entries.flatMap((entry) => entry.escapes),
  };
}

async function readEntry(base: string, full: string): Promise<WalkEntries> {
  const path = toRootPath(base, full);

  if (basename(full).startsWith('.') || isOutsideLayout(path)) {
    return { files: [], skipped: [path], escapes: [] };
  }

  const stat = await lstat(full);

  if (stat.isSymbolicLink()) {
    return readSymlink(base, full);
  }

  if (stat.isDirectory()) {
    return readEntries(base, full);
  }

  return stat.isFile() && isDefinitionsPath(path)
    ? { files: [{ path, size: stat.size }], skipped: [], escapes: [] }
    : { files: [], skipped: [path], escapes: [] };
}

function toRootPath(base: string, full: string): string {
  return relative(base, full).split(sep).join('/');
}

function isOutsideLayout(path: string): boolean {
  return !path.includes('/') && !isDefinitionsRootEntry(path);
}

async function readSymlink(base: string, link: string): Promise<WalkEntries> {
  const path = toRootPath(base, link);

  const target = await realpath(link).catch(() => null);

  if (target === null || !target.startsWith(`${base}${sep}`)) {
    return { files: [], skipped: [], escapes: [path] };
  }

  return { files: [], skipped: [path], escapes: [] };
}

function requireFileLimit(files: readonly WalkFile[], maxFileBytes: number): void {
  const large = files.filter((file) => file.size > maxFileBytes).map((file) => file.path);

  if (large.length > 0) {
    throw new SnapshotError(`files past the ${maxFileBytes}-byte limit`, large);
  }
}

function requireTotalLimit(files: readonly WalkFile[], maxTotalBytes: number): void {
  const totals = files.map((file, index) => ({
    path: file.path,
    total: files.slice(0, index + 1).reduce((sum, earlier) => sum + earlier.size, 0),
  }));

  const past = totals.filter((entry) => entry.total > maxTotalBytes).map((entry) => entry.path);

  if (past.length > 0) {
    throw new SnapshotError(`files past the ${maxTotalBytes}-byte total limit`, past);
  }
}

async function readFiles(
  base: string,
  files: readonly WalkFile[],
  maxFileBytes: number,
): Promise<ReadonlyMap<string, Uint8Array>> {
  const read = await Promise.all(files.map((file) => readKeptFile(base, file.path, maxFileBytes)));

  return new Map(read);
}
