import { mkdir, readdir, rename, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { waitForCondition } from './wait-for-condition';

export interface RunTemplateOptions {
  readonly name: string;

  // the files whose contents decide the template, as globs under the root
  readonly root: string;
  readonly inputs: readonly string[];

  readonly write: (directory: string) => Promise<void>;
  readonly parentDir?: string;

  // a lock older than this belongs to a build that died, so the next caller takes it over
  readonly staleLockMs?: number;
  readonly waitMs?: number;
}

// A memo in one process would build again in every test worker, and the builds would race on one
// folder, so the first caller in the run builds under a lock and every other caller waits for it.
export async function createRunTemplate(options: RunTemplateOptions): Promise<string> {
  const parentDir = options.parentDir ?? join(tmpdir(), 'nixie-run-templates');

  const key = await readInputHash(options.root, options.inputs);

  const directory = join(parentDir, `${options.name}-${key}`);
  const lock = `${directory}.lock`;

  await mkdir(parentDir, { recursive: true });

  let isReady = await probePath(directory);

  while (!isReady) {
    const isLocked = await tryLock(lock);

    await (isLocked
      ? writeTemplateUnderLock(directory, lock, options)
      : waitForLockRelease(directory, lock, options));

    isReady = await probePath(directory);
  }

  return directory;
}

async function readInputHash(root: string, inputs: readonly string[]): Promise<string> {
  const paths = new Set<string>();

  for (const pattern of inputs) {
    for await (const path of new Bun.Glob(pattern).scan({ cwd: root, onlyFiles: true })) {
      if (!path.includes('node_modules')) {
        paths.add(path);
      }
    }
  }

  const hasher = new Bun.CryptoHasher('sha256');

  for (const path of [...paths].toSorted()) {
    const bytes = await Bun.file(join(root, path)).bytes();

    hasher.update(`${path}\0`);
    hasher.update(bytes);
  }

  return hasher.digest('hex').slice(0, 16);
}

async function probePath(path: string): Promise<boolean> {
  try {
    await stat(path);

    return true;
  } catch {
    return false;
  }
}

async function tryLock(lock: string): Promise<boolean> {
  try {
    await mkdir(lock);

    return true;
  } catch {
    return false;
  }
}

async function writeTemplateUnderLock(
  directory: string,
  lock: string,
  options: RunTemplateOptions,
): Promise<void> {
  const building = `${directory}.building`;

  try {
    const isBuilt = await probePath(directory);

    if (isBuilt) {
      return;
    }

    await rm(building, { recursive: true, force: true });
    await mkdir(building);

    await options.write(building);

    await rename(building, directory);
    await removeOlderTemplates(directory, options.name);
  } finally {
    await rm(lock, { recursive: true, force: true });
  }
}

// The templates live in the test temp folder, which can sit in memory, so a new template of a name
// takes the place of the ones that older sources keyed.
async function removeOlderTemplates(directory: string, name: string): Promise<void> {
  const parentDir = dirname(directory);

  const entries = await readdir(parentDir);

  const older = entries.filter(
    (entry) => /^[\da-f]{16}$/u.test(entry.slice(name.length + 1)) && entry.startsWith(`${name}-`),
  );

  await Promise.all(
    older
      .map((entry) => join(parentDir, entry))
      .filter((path) => path !== directory)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
}

const DEFAULT_STALE_LOCK_MS = 120_000;
const DEFAULT_WAIT_MS = 60_000;

async function waitForLockRelease(
  directory: string,
  lock: string,
  options: RunTemplateOptions,
): Promise<void> {
  const staleLockMs = options.staleLockMs ?? DEFAULT_STALE_LOCK_MS;

  await waitForCondition(
    async () => {
      const [isBuilt, isLocked, isStale] = await Promise.all([
        probePath(directory),
        probePath(lock),
        probeLockStale(lock, staleLockMs),
      ]);

      return isBuilt || !isLocked || isStale;
    },
    { timeoutMs: options.waitMs ?? DEFAULT_WAIT_MS, intervalMs: 20 },
  );

  const isStale = await probeLockStale(lock, staleLockMs);

  if (isStale) {
    await rm(lock, { recursive: true, force: true });
  }
}

async function probeLockStale(lock: string, staleLockMs: number): Promise<boolean> {
  try {
    const stats = await stat(lock);

    return Date.now() - stats.mtimeMs > staleLockMs;
  } catch {
    return false;
  }
}
