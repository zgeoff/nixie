/* oxlint-disable one-var, no-await-in-loop, max-lines -- one sequential fixture runner with bounded recovery polls */
import { Database } from 'bun:sqlite';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

interface RestoreOptions {
  restoreConfig: string;
  source: string;
}
interface ReplicaOptions {
  expected: number;
  destination: string;
  config: string;
  source: string;
}

const litestream = process.env.NIXIE_LITESTREAM_BIN;
const rclone = process.env.NIXIE_RCLONE_BIN;
if (!litestream || !rclone) {
  throw new Error('Set NIXIE_LITESTREAM_BIN and NIXIE_RCLONE_BIN');
}
const lsBin = resolve(litestream);
const rcBin = resolve(rclone);
const dir = await mkdtemp(join(tmpdir(), 'nixie-replica-encryption-'));
const env = { PATH: process.env.PATH ?? '', RCLONE_CACHE_DIR: join(dir, 'cache') };
const children: Bun.Subprocess[] = [];
const checks: string[] = [];
const markers = [
  'ENVELOPE_FIRST_792ded',
  'WAL_SECOND_32bd21',
  'OUTAGE_THIRD_556a43',
  'RESTART_FOURTH_b6d54e',
];
let db: Database | null = null;

async function run(args: string[]) {
  const p = Bun.spawn(args, { env, stdout: 'pipe', stderr: 'pipe' });
  children.push(p);
  const timeout = setTimeout(() => p.kill('SIGKILL'), 20_000);
  try {
    const [out, err, code] = await Promise.all([
      new Response(p.stdout).text(),
      new Response(p.stderr).text(),
      p.exited,
    ]);
    if (code) {
      throw new Error(`${args[0]} exit ${code}: ${err}`);
    }
    return out;
  } finally {
    clearTimeout(timeout);
  }
}

async function stop(p: Bun.Subprocess, signal: 'SIGTERM' | 'SIGKILL' = 'SIGTERM') {
  if (p.exitCode !== null || p.signalCode !== null) {
    return;
  }
  p.kill(signal);
  const timeout = setTimeout(() => p.kill('SIGKILL'), 2000);
  try {
    await p.exited;
  } finally {
    clearTimeout(timeout);
  }
}

function createDaemon(args: string[], label: string) {
  const p = Bun.spawn(args, {
    env,
    stdout: Bun.file(join(dir, `${label}.stdout`)),
    stderr: Bun.file(join(dir, `${label}.stderr`)),
  });
  children.push(p);
  return p;
}

async function readFiles(path: string): Promise<string[]> {
  const entries = await readdir(path, { withFileTypes: true });
  const collected = await Promise.all(
    entries.map((e) => (e.isDirectory() ? readFiles(join(path, e.name)) : [join(path, e.name)])),
  );
  return collected.flat();
}

function checkRestored(path: string, expected: number) {
  const restored = new Database(path);
  try {
    const rows = restored.query<{ text: string }, []>('SELECT text FROM records ORDER BY id').all();
    const integrity = restored
      .query<{ integrity_check: string }, []>('PRAGMA integrity_check')
      .get();
    if (integrity?.integrity_check !== 'ok') {
      throw new Error('Restored database failed integrity_check');
    }
    return (
      JSON.stringify(rows.map((row) => row.text)) === JSON.stringify(markers.slice(0, expected))
    );
  } finally {
    restored.close();
  }
}

async function checkReplica(options: ReplicaOptions) {
  await run([
    lsBin,
    'restore',
    '-config',
    options.config,
    '-o',
    options.destination,
    options.source,
  ]);
  return checkRestored(options.destination, options.expected);
}

try {
  const lsOutput = await run([lsBin, 'version']);
  const lsVersion = lsOutput.trim();
  const rcOutput = await run([rcBin, 'version']);
  const [rcVersion] = rcOutput.split('\n');
  if (!lsVersion.includes('0.5.17') || !rcVersion.includes('1.75.2')) {
    throw new Error('Use Litestream 0.5.17 and rclone 1.75.2');
  }
  await mkdir(join(dir, 'objects'));
  const passwordOutput = await run([rcBin, 'obscure', 'public-fixture-password-not-a-secret']);
  const password = passwordOutput.trim();
  const config = join(dir, 'rclone.conf');
  await writeFile(
    config,
    `[crypt]\ntype = crypt\nremote = ${dir}/objects\npassword = ${password}\nfilename_encryption = standard\ndirectory_name_encryption = true\n`,
    { mode: 0o600 },
  );
  await run([rcBin, '--config', config, 'mkdir', 'crypt:replica']);
  const reserver = Bun.serve({
    port: 0,
    hostname: '127.0.0.1',
    fetch: () => new Response('reserve'),
  });
  const port = reserver.port;
  reserver.stop(true);
  const endpoint = `http://127.0.0.1:${port}`;
  let gatewayNumber = 0;
  const startGateway = async (gatewayConfig = config) => {
    const p = createDaemon(
      [
        rcBin,
        '--config',
        gatewayConfig,
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
      `gateway-${++gatewayNumber}`,
    );
    for (let i = 0; i < 50; i++) {
      if (p.exitCode !== null || p.signalCode !== null) {
        throw new Error('Gateway exited before readiness');
      }
      try {
        await fetch(endpoint, { signal: AbortSignal.timeout(200) });
        return p;
      } catch {
        await Bun.sleep(100);
      }
    }
    throw new Error('Gateway readiness timed out');
  };
  let gateway = await startGateway();
  const path = join(dir, 'data.db');
  db = new Database(path);
  db.run('PRAGMA journal_mode=WAL');
  db.run('CREATE TABLE records(id INTEGER PRIMARY KEY, text TEXT)');
  db.query('INSERT INTO records(text) VALUES (?)').run(markers[0]);
  const lsconfig = join(dir, 'litestream.yml');
  const createLsConfig = (source: string) =>
    `dbs:\n  - path: ${source}\n    replica:\n      type: s3\n      bucket: replica\n      path: data\n      endpoint: ${endpoint}\n      region: us-east-1\n      force-path-style: true\n      access-key-id: fixture\n      secret-access-key: fixture-secret\n      sync-interval: 1s\n`;

  await writeFile(lsconfig, createLsConfig(path));
  let ls = createDaemon([lsBin, 'replicate', '-config', lsconfig], 'litestream-1');
  let restoreNumber = 0;
  const runRestore = async (expected: number, label: string, options?: RestoreOptions) => {
    let last = 'Replica did not reach the expected records';
    for (let i = 0; i < 20; i++) {
      try {
        const matches = await checkReplica({
          expected,
          destination: join(dir, `restore-${++restoreNumber}.db`),
          config: options?.restoreConfig ?? lsconfig,
          source: options?.source ?? path,
        });
        if (matches) {
          checks.push(label);
          return;
        }
      } catch (error) {
        last = String(error);
      }
      await Bun.sleep(500);
    }
    throw new Error(last);
  };
  await runRestore(1, 'initial committed record restored with SQLite integrity check');
  db.query('INSERT INTO records(text) VALUES (?)').run(markers[1]);
  await runRestore(2, 'subsequent WAL update restored with exact contents');
  await stop(gateway, 'SIGKILL');
  db.query('INSERT INTO records(text) VALUES (?)').run(markers[2]);
  await Bun.sleep(2000);
  let unreachable = false;
  try {
    await fetch(endpoint, { signal: AbortSignal.timeout(200) });
  } catch {
    unreachable = true;
  }
  if (!unreachable || ls.exitCode !== null || ls.signalCode !== null) {
    throw new Error('Gateway outage did not leave a live replicator with unreachable endpoint');
  }
  checks.push(
    'gateway SIGKILL made endpoint unavailable while local writes and Litestream continued',
  );
  gateway = await startGateway();
  await runRestore(3, 'gateway restart caught up the write committed during its outage');
  await stop(ls, 'SIGKILL');
  db.query('INSERT INTO records(text) VALUES (?)').run(markers[3]);
  ls = createDaemon([lsBin, 'replicate', '-config', lsconfig], 'litestream-2');
  await runRestore(
    4,
    'Litestream SIGKILL and restart caught up a write committed while it was stopped',
  );
  await stop(ls);
  await stop(gateway);
  db.close();
  db = null;
  await rm(path, { force: true });
  await rm(`${path}-wal`, { force: true });
  await rm(`${path}-shm`, { force: true });
  await rm(`${path}-litestream`, { recursive: true, force: true });
  await mkdir(join(dir, 'new-host'));
  const newConfig = join(dir, 'new-host', 'rclone.conf');
  const recoveredOutput = await run([rcBin, 'obscure', 'public-fixture-password-not-a-secret']);
  const recoveredPassword = recoveredOutput.trim();
  await writeFile(
    newConfig,
    `[crypt]\ntype = crypt\nremote = ${dir}/objects\npassword = ${recoveredPassword}\nfilename_encryption = standard\ndirectory_name_encryption = true\n`,
    { mode: 0o600 },
  );
  await rm(config);
  await rm(join(dir, 'cache'), { recursive: true, force: true });
  gateway = await startGateway(newConfig);
  const newSource = join(dir, 'new-host', 'data.db');
  const newLsConfig = join(dir, 'new-host', 'litestream.yml');
  await writeFile(newLsConfig, createLsConfig(newSource));
  await runRestore(
    4,
    'fresh config restored all records without original database, WAL, shadow state or crypt config',
    { restoreConfig: newLsConfig, source: newSource },
  );
  const raw = await readFiles(join(dir, 'objects'));
  if (raw.length === 0) {
    throw new Error('No backing objects');
  }
  for (const f of raw) {
    const bytes = await readFile(f);
    if (markers.some((marker) => bytes.includes(Buffer.from(marker)))) {
      throw new Error('Plaintext marker reached backing objects');
    }
    if (!bytes.subarray(0, 8).equals(Buffer.from('RCLONE\0\0'))) {
      throw new Error('Unexpected crypt header');
    }
  }
  checks.push(
    'every backing object has a crypt header and contains none of four plaintext markers',
  );
  console.log(
    JSON.stringify(
      {
        versions: { litestream: lsVersion, rclone: rcVersion },
        backend: 'encrypted local directory behind loopback S3 gateway',
        checks,
        objectCount: raw.length,
        limitations: [
          'No actual S3/R2, key-store recovery or forget test',
          'No kill during a forced in-flight upload or multipart/concurrency test',
          'No physical host or disk power loss',
          'Marker/header check is not a cryptographic audit',
          'The experimental gateway has no validated cloud recovery bound',
        ],
      },
      null,
      2,
    ),
  );
} finally {
  for (const p of children) {
    await stop(p);
  }
  db?.close();
  await rm(dir, { recursive: true, force: true });
}
