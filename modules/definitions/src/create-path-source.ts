import { lstat, readFile, readdir, realpath } from 'node:fs/promises';
import { basename, join, relative, sep } from 'node:path';
import { buildContentHash } from './build-content-hash';
import { defaultSizeLimits } from './default-size-limits';
import { isDefinitionsPath } from './is-definitions-path';
import { normalizeLineEndings } from './normalize-line-endings';
import { SnapshotError } from './snapshot-error';
import type { DefinitionsSource, SizeLimits, Snapshot } from './types';

export interface PathSourceOptions {
  // the definitions root, such as a directory on the host or a volume mounted into the container
  readonly dir: string;
  readonly limits?: SizeLimits;
}

// A definitions source that walks a directory. Its revision is the content hash, because a
// directory has no commit. It fails at a symlink that leads outside the root and skips one that
// stays inside, so it never reads a linked file.
export function createPathSource(options: PathSourceOptions): DefinitionsSource {
  const limits = options.limits ?? defaultSizeLimits;

  return {
    id: `path:${options.dir}`,
    kind: 'path',
    probe: async () => {
      const snapshot = await readPathSnapshot(options.dir, limits);

      return snapshot.contentHash;
    },
    snapshot: () => readPathSnapshot(options.dir, limits),
  };
}

async function readPathSnapshot(dir: string, limits: SizeLimits): Promise<Snapshot> {
  const base = await realpath(dir);
  const entries = await collectEntries(base, base);

  if (entries.escapes.length > 0) {
    throw new SnapshotError('a symlink leads outside the definitions root', entries.escapes);
  }
  requireFileLimit(entries.files, limits.maxFileBytes);
  requireTotalLimit(entries.files, limits.maxTotalBytes);

  const files = await readFiles(base, entries.files);
  const contentHash = buildContentHash(files);

  return { contentHash, files, revision: contentHash, skipped: entries.skipped.toSorted() };
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

// visits names in sorted order, and Promise.all keeps that order, so files come out in path order
async function collectEntries(base: string, dir: string): Promise<WalkEntries> {
  const names = await readdir(dir);
  const entries = await Promise.all(
    names.toSorted().map((name) => collectEntry(base, join(dir, name))),
  );

  return {
    files: entries.flatMap((entry) => entry.files),
    skipped: entries.flatMap((entry) => entry.skipped),
    escapes: entries.flatMap((entry) => entry.escapes),
  };
}

async function collectEntry(base: string, full: string): Promise<WalkEntries> {
  const path = toRootPath(base, full);

  if (basename(full).startsWith('.')) {
    return { files: [], skipped: [path], escapes: [] };
  }
  const stat = await lstat(full);

  if (stat.isSymbolicLink()) {
    return collectSymlink(base, full);
  }
  if (stat.isDirectory()) {
    return collectEntries(base, full);
  }
  return stat.isFile() && isDefinitionsPath(path)
    ? { files: [{ path, size: stat.size }], skipped: [], escapes: [] }
    : { files: [], skipped: [path], escapes: [] };
}

function toRootPath(base: string, full: string): string {
  return relative(base, full).split(sep).join('/');
}

// a link that resolves nowhere counts as outside, because nothing shows where it would lead
async function collectSymlink(base: string, link: string): Promise<WalkEntries> {
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

// names every file from the one that crossed the limit onwards, in path order
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
): Promise<ReadonlyMap<string, Uint8Array>> {
  const read = await Promise.all(
    files.map(async (file) => {
      const bytes = await readFile(join(base, file.path));

      return [file.path, normalizeLineEndings(new Uint8Array(bytes))] as const;
    }),
  );

  return new Map(read);
}
