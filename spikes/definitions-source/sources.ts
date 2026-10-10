// oxlint-disable one-var, max-statements -- spike code, kept in one readable sequence per source
// One definitions source interface with 2 adapters: a git repo read without a working tree, and a
// local path. Both hash the same canonical listing, so the same definitions give the same hash.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import { extname, join, relative, sep } from 'node:path';

export interface Snapshot {
  contentHash: string;
  files: Map<string, Uint8Array>;
  revision: string;
  skipped: string[];
}

export interface DefinitionsSource {
  id: string;
  kind: 'bucket' | 'git' | 'path';
  probe: () => Promise<string>;
  snapshot: () => Promise<Snapshot>;
}

export interface SourceFilter {
  extensions: Set<string>;
  root: string;
}

export interface GitRemote {
  cacheDir: string;
  ref: string;
  url: string;
}

interface WalkState {
  base: string;
  files: string[];
  skipped: string[];
}

function buildSha256(bytes: Uint8Array | string): string {
  return createHash('sha256').update(bytes).digest('hex');
}

// The canonical listing: one line per file, sorted by path, with the byte length and the file's
// own sha256. Git metadata, mode bits and mtimes never enter it.
export function buildContentHash(files: Map<string, Uint8Array>): string {
  const lines = [...files.keys()].toSorted().map((path) => {
    const bytes = files.get(path) ?? new Uint8Array();
    return `${path}\t${bytes.byteLength}\t${buildSha256(bytes)}\n`;
  });
  return buildSha256(`nixie-definitions-v1\n${lines.join('')}`);
}

// Every allowed extension is text, so a CRLF line ending becomes LF before hashing and before a
// parser sees the file. A Windows checkout with core.autocrlf then hashes like the commit.
function normalizeEol(bytes: Uint8Array): Uint8Array {
  if (!bytes.includes(13)) {
    return bytes;
  }
  const text = new TextDecoder().decode(bytes);
  return new TextEncoder().encode(text.replaceAll('\r\n', '\n'));
}

function isAllowed(path: string, filter: SourceFilter): boolean {
  const prefix = filter.root === '' ? '' : `${filter.root}/`;
  if (!path.startsWith(prefix)) {
    return false;
  }
  if (path.split('/').some((part) => part.startsWith('.'))) {
    return false;
  }
  return filter.extensions.has(extname(path));
}

function runGit(args: string[], input?: string): Buffer {
  const result = spawnSync('git', args, { input, maxBuffer: 256 * 1024 * 1024 });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(' ')}: ${result.stderr.toString()}`);
  }
  return result.stdout;
}

// Parses `git cat-file --batch` output: a header line `<sha> blob <size>`, the bytes, a newline.
function parseBatch(output: Buffer, count: number): Uint8Array[] {
  const blobs: Uint8Array[] = [];
  let offset = 0;
  for (let index = 0; index < count; index += 1) {
    const headerEnd = output.indexOf(10, offset);
    const header = output.subarray(offset, headerEnd).toString();
    const size = Number(header.split(' ')[2]);
    blobs.push(output.subarray(headerEnd + 1, headerEnd + 1 + size));
    offset = headerEnd + 1 + size + 1;
  }
  return blobs;
}

// Fetches the ref into a bare cache repo with depth 1, and returns the commit it points at.
function readRemoteCommit(remote: GitRemote): string {
  if (!existsSync(join(remote.cacheDir, 'HEAD'))) {
    mkdirSync(remote.cacheDir, { recursive: true });
    runGit(['init', '--bare', '--quiet', remote.cacheDir]);
  }
  const target = `${remote.ref}:refs/nixie/definitions`;
  runGit(['-C', remote.cacheDir, 'fetch', '--quiet', '--depth=1', '--force', remote.url, target]);
  const commit = runGit(['-C', remote.cacheDir, 'rev-parse', 'refs/nixie/definitions^{commit}']);
  return commit.toString().trim();
}

function readGitSnapshot(remote: GitRemote, filter: SourceFilter): Snapshot {
  const commit = readRemoteCommit(remote);
  const tree = runGit(['-C', remote.cacheDir, 'ls-tree', '-r', '-z', '--full-tree', commit]);
  const wanted: { path: string; sha: string }[] = [];
  const skipped: string[] = [];
  const cut = filter.root === '' ? 0 : filter.root.length + 1;
  for (const line of tree.toString().split('\0')) {
    const [meta = '', path = ''] = line.split('\t');
    const [mode, type, sha = ''] = meta.split(' ');
    if (type === 'blob' && mode !== '120000' && isAllowed(path, filter)) {
      wanted.push({ path: path.slice(cut), sha });
    } else if (path !== '') {
      skipped.push(path);
    }
  }
  const request = wanted.map((entry) => `${entry.sha}\n`).join('');
  const batch = runGit(['-C', remote.cacheDir, 'cat-file', '--batch'], request);
  const blobs = parseBatch(batch, wanted.length);
  const files = new Map(wanted.map((entry, index) => [entry.path, normalizeEol(blobs[index])]));
  return { contentHash: buildContentHash(files), files, revision: commit, skipped };
}

export function createGitSource(remote: GitRemote, filter: SourceFilter): DefinitionsSource {
  return {
    id: `git:${remote.url}#${remote.ref}`,
    kind: 'git',
    probe: async () => {
      await Promise.resolve();
      return readRemoteCommit(remote);
    },
    snapshot: async () => {
      await Promise.resolve();
      return readGitSnapshot(remote, filter);
    },
  };
}

function collectFiles(state: WalkState, dir: string): void {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const rel = relative(state.base, full).split(sep).join('/');
    const stat = lstatSync(full);
    if (name.startsWith('.')) {
      state.skipped.push(rel);
    } else if (stat.isSymbolicLink()) {
      if (!realpathSync(full).startsWith(`${state.base}${sep}`)) {
        throw new Error(`symlink leaves the root: ${rel}`);
      }
      state.skipped.push(rel);
    } else if (stat.isDirectory()) {
      collectFiles(state, full);
    } else if (stat.isFile()) {
      state.files.push(rel);
    }
  }
}

// The path source treats its directory as the definitions root, so it ignores the filter root.
function readPathSnapshot(dir: string, extensions: Set<string>): Snapshot {
  const state: WalkState = { base: realpathSync(dir), files: [], skipped: [] };
  collectFiles(state, state.base);
  const files = new Map<string, Uint8Array>();
  for (const path of state.files) {
    if (isAllowed(path, { extensions, root: '' })) {
      const bytes = readFileSync(join(state.base, path));
      files.set(path, normalizeEol(bytes));
    } else {
      state.skipped.push(path);
    }
  }
  const contentHash = buildContentHash(files);
  return { contentHash, files, revision: contentHash, skipped: state.skipped };
}

export function createPathSource(dir: string, filter: SourceFilter): DefinitionsSource {
  return {
    id: `path:${dir}`,
    kind: 'path',
    probe: async () => {
      await Promise.resolve();
      return readPathSnapshot(dir, filter.extensions).contentHash;
    },
    snapshot: async () => {
      await Promise.resolve();
      return readPathSnapshot(dir, filter.extensions);
    },
  };
}

// The bucket source is sketched in the README and never runs here: a list call gives each key
// with its ETag and versionId, probe() hashes the (key, ETag) pairs, and snapshot() reads each
// object at its listed versionId and hashes the bytes with buildContentHash.
