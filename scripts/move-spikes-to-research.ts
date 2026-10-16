// oxlint-disable typescript/prefer-readonly-parameter-types -- a RegExp match has no readonly form
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, normalize, relative } from 'node:path';
import { $ } from 'bun';

// A one-off codemod, kept as the record of a mechanical change: it deletes the finished spikes and
// moves every other spike but the SDK ones into the research workspace. Each relative link follows
// its target, and a link to a deleted spike points at the commit that last held it.
const spikesRoot = 'docs/design/platform/spikes';
const researchRoot = 'research';
const archiveURL = 'https://github.com/zgeoff/nixie/tree/e232631a587680970a5c8804455415e7f97140bc';

const removedSpikes = new Set([
  'client-rpc',
  'definitions-source',
  'deploy-local',
  'event-log-db',
  'imp-broker',
  'memory-batch',
  'memory-batch-model',
  'memory-checks',
  'memory-shred',
  'paired-recovery',
  'sdk-placement',
  'session-recovery',
  'tools-endpoint',
]);

// files of a deleted spike that a kept spike imports, copied into the kept spike first
const copiedFiles = new Map([
  ['memory-shred/crypto.ts', 'forget-backups/crypto.ts'],
  ['memory-shred/store.ts', 'forget-backups/store.ts'],
]);

async function runSpikeMove(): Promise<void> {
  const movedSpikes = await collectMovedSpikes();

  await updateAllLinks(movedSpikes);
  await applyCopies();
  await applyRemovals();
  await applyMoves(movedSpikes);
  await updateRepoPaths(movedSpikes);
}

async function collectMovedSpikes(): Promise<string[]> {
  const entries = await readdir(spikesRoot, { withFileTypes: true });

  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => !removedSpikes.has(name) && !name.startsWith('sdk-'));
}

async function updateAllLinks(movedSpikes: readonly string[]): Promise<void> {
  const listing = await $`git ls-files '*.md' '*.ts' '*.tsx'`.text();

  const tracked = listing.split('\n').filter((path) => path !== '' && !isRemovedPath(path));

  for (const file of tracked) {
    // oxlint-disable-next-line no-await-in-loop -- each file is read and written once
    await updateLinks(file, movedSpikes);
  }
}

function isRemovedPath(path: string): boolean {
  const spike = relative(spikesRoot, path).split('/')[0] ?? '';

  return path.startsWith(`${spikesRoot}/`) && removedSpikes.has(spike);
}

// Rewrites each relative Markdown link and each relative string in TypeScript, so it resolves
// from the file's new place to its target's new place.
async function updateLinks(file: string, movedSpikes: readonly string[]): Promise<void> {
  const source = await readFile(file, 'utf8');

  const newFile = resolveNewPath(file, movedSpikes);
  const isMarkdown = file.endsWith('.md');
  const pattern = isMarkdown ? markdownLinkPattern : quotedPathPattern;

  const updated = source.replace(pattern, (whole, ...rest) => {
    const groups = (rest.at(-1) ?? {}) as Record<string, string | undefined>;
    const path = groups['path'] ?? '';
    const target = normalize(join(dirname(file), path));
    const newTarget = resolveNewPath(target, movedSpikes);

    if (newTarget === target && newFile === file) {
      return whole;
    }

    const link = newTarget.startsWith('https://')
      ? newTarget
      : buildRelativePath(dirname(newFile), newTarget, { original: path, isMarkdown });

    return whole.replace(path, link);
  });

  if (updated !== source) {
    await writeFile(file, updated);
  }
}

const markdownLinkPattern = /\]\((?<path>\.{0,2}\/?[^)\s#:]+)(?:#[^)\s]*)?\)/gu;
const quotedPathPattern = /(?<quote>['"])(?<path>\.{1,2}\/[^'"\s]*)\k<quote>/gu;

// where a repo path sits after the move: a deleted spike's path is its archived URL
function resolveNewPath(path: string, movedSpikes: readonly string[]): string {
  if (!path.startsWith(`${spikesRoot}/`)) {
    return path;
  }

  const inner = relative(spikesRoot, path);
  const copy = copiedFiles.get(inner);
  const spike = inner.split('/')[0] ?? '';

  if (copy !== undefined) {
    return resolveNewPath(join(spikesRoot, copy), movedSpikes);
  }

  if (removedSpikes.has(spike)) {
    return `${archiveURL}/${path}`;
  }

  return movedSpikes.includes(spike) ? join(researchRoot, inner) : path;
}

interface LinkStyle {
  readonly original: string;
  readonly isMarkdown: boolean;
}

// keeps the trailing slash of the link it replaces, and the leading `./` that an import needs and a
// link had
function buildRelativePath(from: string, to: string, style: LinkStyle): string {
  const path = relative(from, to) || '.';
  const needsDot = !style.isMarkdown || style.original.startsWith('./');
  const prefixed = path.startsWith('.') || !needsDot ? path : `./${path}`;

  return style.original.endsWith('/') && !prefixed.endsWith('/') ? `${prefixed}/` : prefixed;
}

async function applyCopies(): Promise<void> {
  for (const [from, to] of copiedFiles) {
    // oxlint-disable-next-line no-await-in-loop -- one copy at a time
    const source = await readFile(join(spikesRoot, from), 'utf8');

    // oxlint-disable-next-line no-await-in-loop -- one copy at a time
    await writeFile(join(spikesRoot, to), source);
  }
}

async function applyRemovals(): Promise<void> {
  for (const name of removedSpikes) {
    // oxlint-disable-next-line no-await-in-loop -- git takes one removal at a time
    await $`git rm -r -q ${join(spikesRoot, name)}`;
  }
}

async function applyMoves(movedSpikes: readonly string[]): Promise<void> {
  await mkdir(researchRoot, { recursive: true });

  for (const name of movedSpikes) {
    // oxlint-disable-next-line no-await-in-loop -- git takes one move at a time
    await $`git mv ${join(spikesRoot, name)} ${join(researchRoot, name)}`;

    // oxlint-disable-next-line no-await-in-loop -- one package at a time
    await updatePackage(join(researchRoot, name));
  }

  await $`git add ${researchRoot}`;
}

// Makes a moved spike a workspace package under the repo's scope, typechecked under the research
// workspace's compiler options unless it brought its own. Its lockfile stays, renamed, because a
// container build of the spike installs from it.
async function updatePackage(dir: string): Promise<void> {
  const manifestFile = Bun.file(join(dir, 'package.json'));

  const hasManifest = await manifestFile.exists();

  if (!hasManifest) {
    return;
  }

  const manifest = (await manifestFile.json()) as Record<string, unknown>;
  const updated = buildManifest(manifest, dir.split('/').at(-1) ?? '');

  await Bun.write(manifestFile, `${JSON.stringify(updated, null, 2)}\n`);

  await updateLockfileName(dir, String(manifest['name']), String(updated['name']));
  await createTSConfig(dir);
}

async function updateLockfileName(dir: string, from: string, to: string): Promise<void> {
  const lockfile = Bun.file(join(dir, 'bun.lock'));

  const hasLockfile = await lockfile.exists();

  if (hasLockfile) {
    const source = await lockfile.text();

    await Bun.write(lockfile, source.replace(`"name": "${from}"`, `"name": "${to}"`));
  }
}

function buildManifest(manifest: Record<string, unknown>, spike: string): Record<string, unknown> {
  const scripts = (manifest['scripts'] ?? {}) as Record<string, string>;

  return {
    ...manifest,
    name: `@heynixie/spike-${spike}`,
    scripts: { ...scripts, typecheck: 'tsc --noEmit' },
  };
}

async function createTSConfig(dir: string): Promise<void> {
  const hasTSConfig = await Bun.file(join(dir, 'tsconfig.json')).exists();

  if (!hasTSConfig) {
    await writeFile(join(dir, 'tsconfig.json'), '{ "extends": "../tsconfig.base.json" }\n');
  }
}

// A command, a Dockerfile or a script in a moved spike names its own folder from the repo root.
async function updateRepoPaths(movedSpikes: readonly string[]): Promise<void> {
  const listing = await $`git ls-files ${researchRoot}`.text();

  const files = listing.split('\n').filter((path) => path !== '');

  for (const file of files) {
    // oxlint-disable-next-line no-await-in-loop -- each file is read and written once
    const source = await readFile(file, 'utf8');

    const updated = movedSpikes.reduce(
      (text, name) => text.replaceAll(`${spikesRoot}/${name}`, `${researchRoot}/${name}`),
      source,
    );

    if (updated !== source) {
      // oxlint-disable-next-line no-await-in-loop -- each file is read and written once
      await writeFile(file, updated);
    }
  }
}

await runSpikeMove();
