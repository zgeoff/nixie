/* oxlint-disable one-var, no-await-in-loop, typescript/no-non-null-assertion -- sequential fixture phases with required schema rows */
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createDeploymentKey } from '../memory-shred/crypto.ts';
import {
  createDb,
  createItem,
  createKeyStore,
  readCurrent,
  removeItemKey,
} from '../memory-shred/store.ts';

interface Snapshot {
  id: string;
  tree: string;
}
interface TreeNode {
  name: string;
  content: string[];
}

const binary = process.env.NIXIE_RESTIC_BIN;
if (!binary) {
  throw new Error(
    'Set NIXIE_RESTIC_BIN to a restic 0.19.1 binary; no repository credentials are used.',
  );
}
const restic = resolve(binary);
const root = mkdtempSync(join(tmpdir(), 'nixie-forget-backups-'));
const password = randomBytes(32).toString('hex');
let assertions = 0;

function check(value: unknown): void {
  assert.ok(value);
  assertions += 1;
}

function runRestic(repo: string, args: string[], input?: Uint8Array) {
  return Bun.spawnSync([restic, '--no-cache', '-r', join(root, repo), ...args], {
    env: { PATH: process.env.PATH ?? '', RESTIC_PASSWORD: password },
    stdin: input,
    stdout: 'pipe',
    stderr: 'pipe',
  });
}

function readRestic(repo: string, args: string[], input?: Uint8Array): string {
  const result = runRestic(repo, args, input);
  assert.equal(result.exitCode, 0, result.stderr.toString());
  return result.stdout.toString();
}

function createSnapshot(repo: string, file: string, host: string): string {
  const lines = readRestic(
    repo,
    ['backup', '--stdin', '--stdin-filename', 'store.db', '--host', host, '--json'],
    readFileSync(file),
  );
  const summary = lines
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line) as { message_type: string; snapshot_id?: string })
    .find((row) => row.message_type === 'summary');
  assert.ok(summary?.snapshot_id);
  return summary.snapshot_id;
}

function getSnapshots(repo: string): Snapshot[] {
  return JSON.parse(readRestic(repo, ['snapshots', '--json'])) as Snapshot[];
}

function getFileBlob(repo: string, snapshotId: string): string {
  const tree = JSON.parse(readRestic(repo, ['cat', 'tree', snapshotId])) as { nodes: TreeNode[] };
  const node = tree.nodes.find((entry) => entry.name === 'store.db');
  check(node?.content.length === 1);
  return node!.content[0]!;
}

function writeCopy(database: ReturnType<typeof createDb>, path: string): void {
  if (existsSync(path)) {
    rmSync(path);
  }

  // path comes only from this process's mkdtemp directory, with no SQL quote characters.
  database.exec(`VACUUM INTO '${path}'`);
}

try {
  const version = Bun.spawnSync([restic, 'version']).stdout.toString().trim();
  check(version.startsWith('restic 0.19.1 '));
  const stores = {
    db: createDb(join(root, 'memory.db')),
    keys: createKeyStore(join(root, 'keys.db'), true),
    deploymentKey: await createDeploymentKey(),
  };
  stores.db.exec(
    'CREATE TABLE forget_operation (id TEXT PRIMARY KEY, phase TEXT NOT NULL, snapshot TEXT)',
  );
  stores.keys.exec(
    'CREATE TABLE generation (value INTEGER NOT NULL); INSERT INTO generation VALUES (0)',
  );
  await createItem(stores, 'target', ['target version one', 'target version two']);
  await createItem(stores, 'neighbour', ['keep this fact']);
  writeCopy(stores.db, join(root, 'data-copy.db'));
  writeCopy(stores.keys, join(root, 'stale-keys.db'));
  const staleGeneration = 0;
  readRestic('data-repo', ['init']);
  readRestic('key-repo', ['init']);
  const dataSnapshot = createSnapshot('data-repo', join(root, 'data-copy.db'), 'fixture-data');
  const oldA = createSnapshot('key-repo', join(root, 'stale-keys.db'), 'fixture-a');
  const oldB = createSnapshot('key-repo', join(root, 'stale-keys.db'), 'fixture-b');
  const oldBlob = getFileBlob('key-repo', oldA);

  // A latest data copy alone cannot recover a new item when the key backup is older.
  // This is a paired-store control, not a Litestream execution or a creation-generation test.
  await createItem(stores, 'after-backup', ['fact created after the key snapshot']);
  writeCopy(stores.db, join(root, 'latest-data.db'));
  const latestData = createDb(join(root, 'latest-data.db'));
  const previousKeys = createKeyStore(join(root, 'stale-keys.db'), true);
  check(
    (await readCurrent({ ...stores, db: latestData }, 'after-backup')) ===
      'fact created after the key snapshot',
  );
  check(
    (await readCurrent({ ...stores, db: latestData, keys: previousKeys }, 'after-backup')) ===
      undefined,
  );
  check(
    (await readCurrent({ ...stores, db: latestData, keys: previousKeys }, 'neighbour')) ===
      'keep this fact',
  );
  previousKeys.close();
  latestData.close();
  stores.db
    .query('INSERT INTO forget_operation VALUES (?, ?, NULL)')
    .run('forget-target', 'pending');
  stores.keys
    .transaction(() => {
      removeItemKey(stores.keys, 'target');
      stores.keys.exec('UPDATE generation SET value = value + 1');
    })
    .immediate();
  stores.keys.exec('PRAGMA wal_checkpoint(TRUNCATE)');
  check((await readCurrent(stores, 'target')) === undefined);
  check((await readCurrent(stores, 'neighbour')) === 'keep this fact');
  const currentGeneration = stores.keys
    .query<{ value: number }, []>('SELECT value FROM generation')
    .get()!.value;
  check(staleGeneration !== currentGeneration);

  // Negative control: keep-last is per host/path group; both old key snapshots survive.
  readRestic('key-repo', ['forget', '--keep-last', '1', '--prune', '--max-unused', '0']);
  check(getSnapshots('key-repo').length === 2);
  const staleKeys = createKeyStore(join(root, 'stale-keys.db'), true);
  check((await readCurrent({ ...stores, keys: staleKeys }, 'target')) === 'target version two');
  staleKeys.close();

  writeCopy(stores.keys, join(root, 'fresh-keys.db'));
  const fresh = createSnapshot('key-repo', join(root, 'fresh-keys.db'), 'fixture-current');
  stores.db
    .query('UPDATE forget_operation SET phase = ?, snapshot = ?')
    .run('prune-pending', fresh);

  // Keep the acknowledged fresh snapshot explicitly, across every host/path group.
  const obsolete = getSnapshots('key-repo')
    .filter((row) => row.id !== fresh)
    .map((row) => row.id);
  check(obsolete.length === 2 && obsolete.includes(oldA) && obsolete.includes(oldB));
  readRestic('key-repo', ['forget', ...obsolete]);
  check(getSnapshots('key-repo').length === 1);

  // Snapshot removal alone leaves recoverable blob data: reconstruct the old key file.
  const leftover = runRestic('key-repo', ['cat', 'blob', oldBlob]);
  check(leftover.exitCode === 0);
  writeFileSync(join(root, 'leftover-keys.db'), leftover.stdout);
  const leftoverKeys = createKeyStore(join(root, 'leftover-keys.db'), true);
  check((await readCurrent({ ...stores, keys: leftoverKeys }, 'target')) === 'target version two');
  leftoverKeys.close();

  // Simulated crash/restart: reopen durable phase and retry prune before completion.
  stores.db.close();
  stores.keys.close();
  const recovered = createDb(join(root, 'memory.db'));
  check(
    recovered.query<{ phase: string }, []>('SELECT phase FROM forget_operation').get()!.phase ===
      'prune-pending',
  );
  readRestic('key-repo', ['prune', '--max-unused', '0']);
  readRestic('key-repo', ['prune', '--max-unused', '0']);
  check(runRestic('key-repo', ['cat', 'blob', oldBlob]).exitCode !== 0);
  readRestic('key-repo', ['check', '--read-data']);
  const remaining = getSnapshots('key-repo');
  check(remaining.length === 1 && remaining[0]!.id === fresh);
  mkdirSync(join(root, 'restore-data'));
  mkdirSync(join(root, 'restore-keys'));
  readRestic('data-repo', ['restore', dataSnapshot, '--target', join(root, 'restore-data')]);
  for (const snapshot of remaining) {
    readRestic('key-repo', ['restore', snapshot.id, '--target', join(root, 'restore-keys')]);
    const restored = {
      db: createDb(join(root, 'restore-data', 'store.db')),
      keys: createKeyStore(join(root, 'restore-keys', 'store.db'), true),
      deploymentKey: stores.deploymentKey,
    };
    check((await readCurrent(restored, 'target')) === undefined);
    check((await readCurrent(restored, 'neighbour')) === 'keep this fact');
    restored.keys.close();
    restored.db.close();
  }
  for (const name of ['stale-keys.db', 'leftover-keys.db', 'fresh-keys.db']) {
    for (const suffix of ['', '-wal', '-shm']) {
      rmSync(join(root, name + suffix), { force: true });
    }
  }
  check(!existsSync(join(root, 'stale-keys.db')) && !existsSync(join(root, 'leftover-keys.db')));
  recovered.query("UPDATE forget_operation SET phase = 'complete'").run();
  check(
    recovered.query<{ phase: string }, []>('SELECT phase FROM forget_operation').get()!.phase ===
      'complete',
  );
  recovered.close();
  console.log(
    JSON.stringify(
      {
        result: 'pass',
        assertions,
        version,
        modelCalls: 0,
        controls: {
          groupedKeepLastRetainsOldSnapshots: 2,
          snapshotForgetAloneStillDecrypts: true,
          latestDataWithoutNewKeysCannotRecoverNewText: true,
        },
        completion: {
          keySnapshots: 1,
          obsoleteBlobUnavailable: true,
          forgottenItemUnreadable: true,
          neighbourReadable: true,
        },
        recovery: 'reopened durable prune-pending phase; repeated prune succeeds',
        limits: [
          'local filesystem backend only',
          'restart simulated by reopening, no SIGKILL',
          'no provider versioning or media-erasure proof',
          'generation comparison is a harness gate, not concurrency stress',
        ],
      },
      null,
      2,
    ),
  );
} finally {
  rmSync(root, { recursive: true, force: true });
}
