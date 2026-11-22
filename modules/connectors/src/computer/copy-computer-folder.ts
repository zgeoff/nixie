import { join } from 'node:path';
import type { Sandbox } from '@heynixie/sandbox';

// what a computer disk keeps under the guest's home: Chromium's profile and the assistant's files
export const computerFolders = ['profile', 'files'] as const;

export type ComputerFolder = (typeof computerFolders)[number];

export interface FolderEnds {
  readonly from: Sandbox;
  readonly fromEnv: Readonly<Record<string, string>>;
  readonly to: Sandbox;
  readonly toEnv: Readonly<Record<string, string>>;
  readonly folder: ComputerFolder;
}

// Copies one folder of one sandbox into another, with file bytes and modes, directory modes and
// symlinks, and moves a file of any size in pieces. It throws unless the new folder lists the same
// entries as the old one. It removes nothing from the old disk.
export async function copyComputerFolder(ends: FolderEnds): Promise<void> {
  const fromHome = await ends.from.resolveHome(ends.fromEnv);
  const toHome = await ends.to.resolveHome(ends.toEnv);

  const source = toRootPath(join(fromHome.copyPath, ends.folder));
  const target = toRootPath(join(toHome.copyPath, ends.folder));

  const entries = await readFolderEntries(ends.from, source);

  // a failed earlier copy may have left some of the folder behind
  await runStep(ends.to, ['sh', '-c', 'rm -rf -- "$1" && mkdir -p -- "$1"', 'sh', target]);

  for (const entry of entries) {
    await copyEntry(ends, { source, target }, entry);
  }

  for (const entry of entries.filter((candidate) => candidate.kind === 'dir').toReversed()) {
    await runStep(ends.to, ['chmod', '--', entry.mode, join(target, entry.path)]);
  }

  const held = await readFolderEntries(ends.to, target);

  const mismatch = findMismatch(entries, held);

  if (mismatch !== null) {
    throw new Error(`the new disk differs from the old one in ${ends.folder}: ${mismatch}`);
  }
}

// The guest's exec runs from the root, so a path below it reads the same for every adapter.
function toRootPath(path: string): string {
  return path.replace(/^\/+/u, '');
}

export interface FolderEntry {
  readonly kind: 'file' | 'dir' | 'link';

  // the permission bits in octal, such as 644
  readonly mode: string;

  // the bytes of a file, and 0 for any other kind
  readonly bytes: number;

  // where a link points, and an empty string for any other kind
  readonly target: string;
  readonly path: string;
}

// the entries one listing returns, which keeps its output under the 1 MiB limit of one exec
const pageEntries = 200;
const fieldsPerEntry = 5;

// A folder lists a page of its entries at a time. It keeps files, directories and symlinks: a
// socket or a pipe holds no data.
const listScript =
  String.raw`[ -d "$1" ] || exit 0; cd -- "$1" && find . -mindepth 1 \( -type f -o -type d -o -type l \) ` +
  String.raw`-printf '%y\0%m\0%s\0%l\0%P\0' | tail -z -n +"$2" | head -z -n "$3"`;

async function readFolderEntries(sandbox: Sandbox, folder: string): Promise<FolderEntry[]> {
  const entries: FolderEntry[] = [];

  for (;;) {
    const firstField = entries.length * fieldsPerEntry + 1;

    const result = await runStep(sandbox, [
      'sh',
      '-c',
      listScript,
      'sh',
      folder,
      String(firstField),
      String(pageEntries * fieldsPerEntry),
    ]);

    if (result.isCut) {
      throw new Error(`the listing of ${folder} passes the output limit of one exec`);
    }

    const page = parseFolderEntries(new TextDecoder().decode(result.bytes));

    entries.push(...page);

    if (page.length < pageEntries) {
      return entries;
    }
  }
}

interface StepOutput {
  readonly bytes: Uint8Array<ArrayBuffer>;
  readonly isCut: boolean;
}

async function runStep(
  sandbox: Sandbox,
  argv: readonly string[],
  stdin?: Uint8Array,
): Promise<StepOutput> {
  const result = await sandbox.exec({ argv, cwd: '/', ...(stdin === undefined ? {} : { stdin }) });

  if (result.code !== 0) {
    const stderr = new TextDecoder().decode(result.stderr.bytes);

    throw new Error(
      `a step of the folder copy failed with ${result.signal ?? String(result.code)}: ${stderr}`,
    );
  }

  return { bytes: result.stdout.bytes, isCut: result.stdout.isCut };
}

// Splits the NUL-separated output of the listing into entries.
export function parseFolderEntries(output: string): FolderEntry[] {
  const fields = output.split('\0');

  // the output ends with a NUL, which leaves one empty piece
  fields.pop();

  if (fields.length % fieldsPerEntry !== 0) {
    throw new Error('the listing of a folder ended in the middle of an entry');
  }

  const entries: FolderEntry[] = [];

  for (let index = 0; index < fields.length; index += fieldsPerEntry) {
    const [type = '', mode = '', bytes = '', target = '', path = ''] = fields.slice(
      index,
      index + fieldsPerEntry,
    );

    entries.push(buildFolderEntry({ type, mode, bytes, target, path }));
  }

  return entries;
}

interface ListedFields {
  readonly type: string;
  readonly mode: string;
  readonly bytes: string;
  readonly target: string;
  readonly path: string;
}

function buildFolderEntry(fields: ListedFields): FolderEntry {
  if (fields.type === 'd') {
    return { kind: 'dir', mode: fields.mode, bytes: 0, target: '', path: fields.path };
  }

  if (fields.type === 'l') {
    return { kind: 'link', mode: fields.mode, bytes: 0, target: fields.target, path: fields.path };
  }

  return {
    kind: 'file',
    mode: fields.mode,
    bytes: Number(fields.bytes),
    target: '',
    path: fields.path,
  };
}

interface FolderPaths {
  readonly source: string;
  readonly target: string;
}

async function copyEntry(ends: FolderEnds, paths: FolderPaths, entry: FolderEntry): Promise<void> {
  const to = join(paths.target, entry.path);

  if (entry.kind === 'dir') {
    await runStep(ends.to, ['mkdir', '-p', '--', to]);

    return;
  }

  if (entry.kind === 'link') {
    await runStep(ends.to, ['ln', '-s', '--', entry.target, to]);

    return;
  }

  await copyFile(ends, { from: join(paths.source, entry.path), to }, entry);
}

// One exec of a sandbox returns at most 1 MiB of output, so a file moves in pieces of that size.
const chunkBytes = 1024 * 1024;
const readChunkScript = 'dd if="$1" bs=1048576 skip="$2" count=1 status=none';

// The mode goes on with the last piece, because a file whose mode forbids writing takes no more.
const startFileScript = 'cat > "$1" && { [ -z "$2" ] || chmod -- "$2" "$1"; }';
const appendFileScript = 'cat >> "$1" && { [ -z "$2" ] || chmod -- "$2" "$1"; }';

interface FilePaths {
  readonly from: string;
  readonly to: string;
}

async function copyFile(ends: FolderEnds, paths: FilePaths, entry: FolderEntry): Promise<void> {
  const chunks = Math.max(1, Math.ceil(entry.bytes / chunkBytes));

  for (let index = 0; index < chunks; index += 1) {
    const expectedBytes = Math.min(chunkBytes, entry.bytes - index * chunkBytes);

    const read = await runStep(ends.from, [
      'sh',
      '-c',
      readChunkScript,
      'sh',
      paths.from,
      String(index),
    ]);

    if (read.isCut || read.bytes.byteLength !== expectedBytes) {
      throw new Error(`the old disk gave ${String(read.bytes.byteLength)} bytes of ${entry.path}`);
    }

    const script = index === 0 ? startFileScript : appendFileScript;
    const mode = index === chunks - 1 ? entry.mode : '';

    await runStep(ends.to, ['sh', '-c', script, 'sh', paths.to, mode], read.bytes);
  }
}

// Names the first entry that the 2 listings do not share, or null when they match. Entries
// compare by kind, mode, symlink target and, for a file, size.
export function findMismatch(
  old: readonly FolderEntry[],
  held: readonly FolderEntry[],
): string | null {
  const oldByPath = new Map(old.map((entry) => [entry.path, entry]));
  const heldByPath = new Map(held.map((entry) => [entry.path, entry]));

  for (const [path, entry] of oldByPath) {
    const found = heldByPath.get(path);

    if (found === undefined) {
      return `${path} is missing`;
    }

    if (JSON.stringify(found) !== JSON.stringify(entry)) {
      return `${path} has other contents or permissions`;
    }
  }

  const extra = [...heldByPath.keys()].find((path) => !oldByPath.has(path));

  return extra === undefined ? null : `${extra} is extra`;
}
