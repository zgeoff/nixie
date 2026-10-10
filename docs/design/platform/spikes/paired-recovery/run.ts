/* oxlint-disable one-var, no-await-in-loop -- ordered fixture publication and bounded replica polls */
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createReplicaConfig, createRuntime } from './process.ts';
import {
  createData,
  createItem,
  createKeys,
  createWrappingKey,
  getGeneration,
  readItem,
  removeKey,
} from './store.ts';

interface Snapshot {
  id: string;
}
interface Summary {
  message_type: string;
  snapshot_id?: string;
}

const lsInput = process.env.NIXIE_LITESTREAM_BIN;
const rcInput = process.env.NIXIE_RCLONE_BIN;
const resticInput = process.env.NIXIE_RESTIC_BIN;
if (!lsInput || !rcInput || !resticInput) {
  throw new Error('Set NIXIE_LITESTREAM_BIN, NIXIE_RCLONE_BIN and NIXIE_RESTIC_BIN');
}
const ls = resolve(lsInput);
const rc = resolve(rcInput);
const restic = resolve(resticInput);
const dir = await mkdtemp(join(tmpdir(), 'nixie-paired-recovery-'));
const runtime = createRuntime(dir);
const checks: string[] = [];
const timings: number[] = [];
const databases: ReturnType<typeof createData>[] = [];
function check(condition: boolean, label: string) {
  assert.ok(condition, label);
  checks.push(label);
}

try {
  const lsVersion = await runtime.run([ls, 'version']);
  const rcVersion = await runtime.run([rc, 'version']);
  const resticVersion = await runtime.run([restic, 'version']);
  assert.equal(lsVersion.trim(), '0.5.17');
  assert.ok(rcVersion.startsWith('rclone v1.75.2\n'));
  assert.ok(resticVersion.startsWith('restic 0.19.1 '));
  await mkdir(join(dir, 'objects'));
  const obscured = await runtime.run([rc, 'obscure', 'public-fixture-crypt-password']);
  const rcConfig = join(dir, 'rclone.conf');
  await writeFile(
    rcConfig,
    `[crypt]\ntype = crypt\nremote = ${dir}/objects\npassword = ${obscured.trim()}\nfilename_encryption = standard\ndirectory_name_encryption = true\n`,
    { mode: 0o600 },
  );
  await runtime.run([rc, '--config', rcConfig, 'mkdir', 'crypt:replica']);
  const reserve = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch: () => new Response('reserve'),
  });
  const port = reserve.port;
  reserve.stop(true);
  const endpoint = `http://127.0.0.1:${port}`;
  const gateway = runtime.start(
    [
      rc,
      '--config',
      rcConfig,
      'serve',
      's3',
      'crypt:',
      '--addr',
      `127.0.0.1:${port}`,
      '--auth-key',
      'fixture,fixture-secret',
      '--vfs-cache-mode',
      'off',
    ],
    'gateway',
  );
  let ready = false;
  for (let i = 0; i < 50; i++) {
    try {
      await fetch(endpoint, { signal: AbortSignal.timeout(200) });
      ready = true;
      break;
    } catch {
      await Bun.sleep(100);
    }
  }
  assert.ok(ready && gateway.signalCode === null && gateway.exitCode === null);
  const dataPath = join(dir, 'data.db');
  const keysPath = join(dir, 'keys.db');
  const stores = {
    data: createData(dataPath),
    keys: createKeys(keysPath),
    wrappingKey: await createWrappingKey(),
  };
  databases.push(stores.data, stores.keys);
  await createItem(stores, 'first', 'first fixture fact');
  const repo = join(dir, 'key-repo');
  const resticArgs = [restic, '--no-cache', '-r', repo];
  await runtime.run([...resticArgs, 'init']);
  await mkdir(join(dir, 'stage'));
  const staging = join(dir, 'stage', 'keys.db');
  const createSnapshot = async () => {
    const generation = getGeneration(stores.keys);
    await rm(staging, { force: true });
    stores.keys.query('VACUUM INTO ?').run(staging);
    const started = performance.now();
    const input = await readFile(staging);
    const output = await runtime.run(
      [
        ...resticArgs,
        'backup',
        '--json',
        '--host',
        'fixture',
        '--stdin',
        '--stdin-filename',
        'keys.db',
      ],
      { input },
    );
    const summary = output
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as Summary)
      .find((message) => message.message_type === 'summary');
    assert.ok(summary?.snapshot_id);
    timings.push(performance.now() - started);
    return { id: summary.snapshot_id, generation };
  };
  const firstSnapshot = await createSnapshot();
  const readRestoredKeys = async (snapshot: string, label: string) => {
    const destination = join(dir, label);
    await mkdir(destination);
    await runtime.run([...resticArgs, 'dump', snapshot, 'keys.db'], {
      output: join(destination, 'keys.db'),
    });
    const keys = createKeys(join(destination, 'keys.db'));
    databases.push(keys);
    return keys;
  };
  const staleKeys = await readRestoredKeys(firstSnapshot.id, 'old-restore');
  const config = await createReplicaConfig(dir, dataPath, endpoint);
  const replicator = runtime.start([ls, 'replicate', '-config', config], 'litestream');
  await createItem(stores, 'second', 'second fixture fact after the old key backup');
  let restoreNumber = 0;
  const readRestoredData = async () => {
    const path = join(dir, `data-restore-${++restoreNumber}.db`);
    await runtime.run([ls, 'restore', '-config', config, '-o', path, dataPath]);
    const data = createData(path);
    databases.push(data);
    return data;
  };
  let replicated: ReturnType<typeof createData> | null = null;
  for (let i = 0; i < 20; i++) {
    try {
      const data = await readRestoredData();
      const value = await readItem({ ...stores, data }, 'second');
      if (value === 'second fixture fact after the old key backup') {
        replicated = data;
        break;
      }
    } catch {
      // The initial replica can lag this committed fixture write.
    }
    await Bun.sleep(500);
  }
  assert.ok(replicated);
  check(
    (await readItem({ ...stores, data: replicated, keys: staleKeys }, 'first')) ===
      'first fixture fact',
    'continuous encrypted replica restores an older fact with the old key snapshot',
  );
  check(
    (await readItem({ ...stores, data: replicated, keys: staleKeys }, 'second')) === undefined,
    'negative control: fresh replica with stale keys cannot restore a new fact',
  );
  const secondSnapshot = await createSnapshot();
  const currentKeys = await readRestoredKeys(secondSnapshot.id, 'current-restore');
  check(
    (await readItem({ ...stores, data: replicated, keys: currentKeys }, 'second')) ===
      'second fixture fact after the old key backup',
    'new generation key snapshot makes the same continuous data replica readable',
  );
  check(
    secondSnapshot.generation > firstSnapshot.generation,
    'new key allocation advances the published generation',
  );
  const stagedGeneration = secondSnapshot.generation;
  removeKey(stores.keys, 'first');
  check(
    stagedGeneration !== getGeneration(stores.keys),
    'a pre-forget generation is stale before the next key publication',
  );
  staleKeys.close();
  currentKeys.close();
  await rm(join(dir, 'old-restore'), { recursive: true, force: true });
  await rm(join(dir, 'current-restore'), { recursive: true, force: true });
  const forgottenSnapshot = await createSnapshot();
  const snapshotOutput = await runtime.run([...resticArgs, 'snapshots', '--json']);
  const snapshots = JSON.parse(snapshotOutput) as Snapshot[];
  const obsolete = snapshots
    .filter((snapshot) => snapshot.id !== forgottenSnapshot.id)
    .map((snapshot) => snapshot.id);
  await runtime.run([...resticArgs, 'forget', ...obsolete]);
  await runtime.run([...resticArgs, 'prune', '--max-unused', '0']);
  await runtime.run([...resticArgs, 'check', '--read-data']);
  await rm(join(dir, 'stage'), { recursive: true, force: true });
  const survivorOutput = await runtime.run([...resticArgs, 'snapshots', '--json']);
  const survivors = JSON.parse(survivorOutput) as Snapshot[];
  check(
    survivors.length === 1 && survivors[0]?.id === forgottenSnapshot.id,
    'key repository keeps only the explicit post-forget snapshot after prune and read-data check',
  );
  await runtime.stop(replicator);
  stores.data.close();
  stores.keys.close();
  await rm(dataPath, { force: true });
  await rm(`${dataPath}-wal`, { force: true });
  await rm(`${dataPath}-shm`, { force: true });
  await rm(`${dataPath}-litestream`, { recursive: true, force: true });
  await rm(keysPath, { force: true });
  await rm(`${keysPath}-wal`, { force: true });
  await rm(`${keysPath}-shm`, { force: true });
  const recoveredData = await readRestoredData();
  const recoveredKeys = await readRestoredKeys(forgottenSnapshot.id, 'fresh-host-restore');
  const recovered = {
    data: recoveredData,
    keys: recoveredKeys,
    wrappingKey: await createWrappingKey(),
  };
  check(
    (await readItem(recovered, 'first')) === undefined,
    'fresh restoration of data plus current keys cannot read the forgotten fact',
  );
  check(
    (await readItem(recovered, 'second')) === 'second fixture fact after the old key backup',
    'fresh restoration retains the new fact after original live database and keys removal',
  );
  console.log(
    JSON.stringify(
      {
        checks,
        keyPublicationMilliseconds: timings.map((value) => Math.round(value)),
        backend:
          'local Restic key repository plus encrypted local objects behind loopback S3 gateway',
        limitations: [
          'No cloud API, inference model or production cipher format',
          'No concurrent publisher, debounce scheduler, forced in-flight kill or physical power-loss proof',
          'No measured production recovery bound; key-generation comparisons are sequential controls',
          'No actual sops recovery; the key-wrapping recovery input is a public fixture',
        ],
      },
      null,
      2,
    ),
  );
} finally {
  try {
    await runtime.close();
  } finally {
    for (const database of databases) {
      database.close();
    }
    await rm(dir, { recursive: true, force: true });
  }
}
