// A stand-in for nixie's image: memory items with a key per item, a key store apart from the
// database, a schema version per build, and a database backup before each migration. Commands and
// env vars are listed in the README.

/* oxlint-disable one-var, sort-vars, no-await-in-loop, max-params, max-lines, max-statements -- a stand-in whose steps run in order */
import { Database } from 'bun:sqlite';
import { existsSync, mkdirSync, renameSync, rmSync } from 'node:fs';

interface MemoryRow {
  ct: Uint8Array;
  id: number;
  iv: Uint8Array;
}

interface KeyRow {
  wrapped: Uint8Array;
}

interface CountRow {
  n: number;
}

interface Secrets {
  deployment_key: string;
  restic_password: string;
}

interface Item {
  id: number;
  text: string | null;
}

const build = Number(process.env.NIXIE_BUILD ?? '1'),
  dataDir = process.env.NIXIE_DATA_DIR ?? '/data',
  memoryTable = build >= 2 ? 'memory_items' : 'memory',
  offsiteDir = process.env.NIXIE_OFFSITE_DIR ?? '/offsite',
  port = Number(process.env.NIXIE_PORT ?? '8080'),
  schemaOfBuild = build;

// sops reads the age key that the host mounts read-only, and the plaintext stays in this
// process's memory: never in a file, a volume or the container's configuration.
function readSecrets(): Secrets {
  const path = process.env.NIXIE_SECRETS_SOPS ?? '/deploy/secrets.yaml',
    started = performance.now();
  const result = Bun.spawnSync(['sops', 'decrypt', '--output-type', 'json', path], {
    stderr: 'pipe',
    stdout: 'pipe',
  });
  if (result.exitCode !== 0) {
    throw new Error(`sops decrypt failed: ${result.stderr.toString().trim()}`);
  }
  const parsed = JSON.parse(result.stdout.toString()) as Partial<Secrets>;
  if (!parsed.deployment_key || !parsed.restic_password) {
    throw new Error('secrets need deployment_key and restic_password');
  }
  const decryptMs = Math.round(performance.now() - started);
  console.error(JSON.stringify({ decryptMs }));
  return { deployment_key: parsed.deployment_key, restic_password: parsed.restic_password };
}

function loadDeploymentKey(secrets: Secrets): Promise<CryptoKey> {
  const raw = Buffer.from(secrets.deployment_key, 'base64');
  return crypto.subtle.importKey('raw', raw, 'AES-KW', false, ['wrapKey', 'unwrapKey']);
}

function runRestic(secrets: Secrets, args: string[]): string {
  const result = Bun.spawnSync(['restic', ...args], {
    env: { ...process.env, RESTIC_PASSWORD: secrets.restic_password },
    stderr: 'pipe',
    stdout: 'pipe',
  });
  if (result.exitCode !== 0) {
    throw new Error(`restic ${args.join(' ')} failed: ${result.stderr.toString().trim()}`);
  }
  return result.stdout.toString();
}

function loadKeyStore(path: string): Database {
  const keys = new Database(path, { create: true, strict: true });
  keys.run('PRAGMA journal_mode = WAL');
  keys.run('PRAGMA synchronous = FULL');
  keys.run('PRAGMA secure_delete = ON');
  keys.run('CREATE TABLE IF NOT EXISTS keys (item_id INTEGER PRIMARY KEY, wrapped BLOB NOT NULL)');
  return keys;
}

function loadDatabase(path: string): Database {
  const db = new Database(path, { create: true, strict: true });
  db.run('PRAGMA journal_mode = WAL');
  db.run('PRAGMA synchronous = FULL');
  return db;
}

function writePreMigrationBackup(db: Database, from: number): void {
  const dir = `${dataDir}/backups`,
    started = performance.now(),
    target = `${dir}/pre-migration-${from}-to-${schemaOfBuild}-${Date.now()}.db`;
  mkdirSync(dir, { recursive: true });
  db.run(`VACUUM INTO '${target}'`);
  const ms = Math.round(performance.now() - started);
  console.log(JSON.stringify({ backup: target, ms, phase: 'pre-migration' }));
}

function applyMigrations(db: Database): number {
  const row = db.query('PRAGMA user_version').get() as { user_version: number },
    current = row.user_version;
  if (current > schemaOfBuild) {
    console.error(
      `database schema ${current} is newer than build ${build}, which knows schema ` +
        `${schemaOfBuild}; restore the backup taken before the upgrade`,
    );
    process.exit(78);
  }
  if (current === 0) {
    db.run('CREATE TABLE memory (id INTEGER PRIMARY KEY, iv BLOB NOT NULL, ct BLOB NOT NULL)');
    db.run('PRAGMA user_version = 1');
  }
  if (current >= 1 && current < schemaOfBuild) {
    writePreMigrationBackup(db, current);
  }
  if (schemaOfBuild >= 2 && current < 2) {
    db.transaction(() => {
      db.run('ALTER TABLE memory RENAME TO memory_items');
      db.run("ALTER TABLE memory_items ADD COLUMN source TEXT NOT NULL DEFAULT 'owner'");
      db.run('PRAGMA user_version = 2');
    })();
  }
  return schemaOfBuild;
}

async function createItem(
  db: Database,
  keys: Database,
  kek: CryptoKey,
  text: string,
): Promise<number> {
  const algorithm = { length: 256, name: 'AES-GCM' },
    iv = crypto.getRandomValues(new Uint8Array(12)),
    plain = new TextEncoder().encode(text);
  const itemKey = await crypto.subtle.generateKey(algorithm, true, ['encrypt', 'decrypt']);
  const sealed = await crypto.subtle.encrypt({ iv, name: 'AES-GCM' }, itemKey, plain);
  const wrappedKey = await crypto.subtle.wrapKey('raw', itemKey, kek, 'AES-KW');
  const ct = new Uint8Array(sealed),
    wrapped = new Uint8Array(wrappedKey);
  const row = db
    .query(`INSERT INTO ${memoryTable} (iv, ct) VALUES ($iv, $ct) RETURNING id`)
    .get({ ct, iv }) as { id: number };
  keys
    .query('INSERT INTO keys (item_id, wrapped) VALUES ($id, $wrapped)')
    .run({ id: row.id, wrapped });
  return row.id;
}

async function readItems(
  db: Database,
  keys: Database,
  kek: CryptoKey,
  table: string,
): Promise<Item[]> {
  const out: Item[] = [],
    rows = db.query(`SELECT id, iv, ct FROM ${table} ORDER BY id`).all() as MemoryRow[],
    lookup = keys.query('SELECT wrapped FROM keys WHERE item_id = $id');
  for (const row of rows) {
    const key = lookup.get({ id: row.id }) as KeyRow | null;
    if (key) {
      const itemKey = await crypto.subtle.unwrapKey(
        'raw',
        key.wrapped,
        kek,
        'AES-KW',
        'AES-GCM',
        false,
        ['decrypt'],
      );
      const plain = await crypto.subtle.decrypt({ iv: row.iv, name: 'AES-GCM' }, itemKey, row.ct);
      out.push({ id: row.id, text: new TextDecoder().decode(plain) });
    } else {
      out.push({ id: row.id, text: null });
    }
  }
  return out;
}

function removeKey(keys: Database, id: number): boolean {
  const result = keys.query('DELETE FROM keys WHERE item_id = $id').run({ id });
  keys.run('PRAGMA wal_checkpoint(TRUNCATE)');
  return result.changes === 1;
}

function countRows(db: Database, table: string): number {
  const row = db.query(`SELECT count(*) AS n FROM ${table}`).get() as CountRow;
  return row.n;
}

function getHealth(db: Database, keys: Database, schema: number): Record<string, unknown> {
  const check = db.query('PRAGMA integrity_check').get() as { integrity_check: string };
  return {
    build,
    integrity: check.integrity_check,
    items: countRows(db, memoryTable),
    keys: countRows(keys, 'keys'),
    schema,
    status: 'ok',
  };
}

async function runServer(): Promise<void> {
  const secrets = readSecrets();
  const kek = await loadDeploymentKey(secrets);
  const db = loadDatabase(`${dataDir}/nixie.db`),
    keys = loadKeyStore(`${dataDir}/keys.db`);
  const schema = applyMigrations(db);
  Bun.serve({
    async fetch(request) {
      const url = new URL(request.url);
      const parts = url.pathname.split('/').filter(Boolean);
      if (url.pathname === '/health') {
        return Response.json(getHealth(db, keys, schema));
      }
      if (url.pathname === '/memory' && request.method === 'POST') {
        const text = await request.text();
        const id = await createItem(db, keys, kek, text);
        return Response.json({ id });
      }
      if (url.pathname === '/memory') {
        const items = await readItems(db, keys, kek, memoryTable);
        return Response.json(items);
      }
      if (parts[0] === 'forget' && request.method === 'POST') {
        return Response.json({ forgotten: removeKey(keys, Number(parts[1])) });
      }
      if (parts[0] === 'debug-wrapped') {
        const key = keys
          .query('SELECT wrapped FROM keys WHERE item_id = $id')
          .get({ id: Number(parts[1]) }) as KeyRow | null;
        const wrappedHex = key ? Buffer.from(key.wrapped).toString('hex') : null;
        return Response.json({ wrappedHex });
      }
      return new Response('not found\n', { status: 404 });
    },
    port,
  });

  // Bun is PID 1 in the container and gets no default signal handlers, so without this a stop
  // waits out Docker's 10 s timeout and ends in SIGKILL.
  process.on('SIGTERM', () => {
    db.close();
    keys.close();
    process.exit(0);
  });
  console.log(JSON.stringify({ build, listening: port, schema }));
}

async function checkHealth(): Promise<void> {
  const response = await fetch(`http://127.0.0.1:${port}/health`).catch(() => null),
    code = response?.ok ? 0 : 1;
  process.exit(code);
}

function writeSnapshots(dir: string): void {
  mkdirSync(dir, { recursive: true });
  for (const name of ['nixie.db', 'keys.db']) {
    const source = new Database(`${dataDir}/${name}`, { readonly: true }),
      started = performance.now(),
      target = `${dir}/${name}`;
    if (existsSync(target)) {
      rmSync(target);
    }
    source.run(`VACUUM INTO '${target}'`);
    const ms = Math.round(performance.now() - started);
    console.log(JSON.stringify({ ms, snapshot: target }));
    source.close();
  }
}

function setupRepo(secrets: Secrets, repo: string): void {
  if (!existsSync(`${repo}/config`)) {
    runRestic(secrets, ['-r', repo, 'init']);
  }
}

// The database goes to a repo with long retention, and the key store to its own repo that keeps
// one snapshot and prunes every unused byte. "naive" puts both in one long-retention repo, the
// case the split exists to avoid.
function runBackup(mode: string): void {
  const secrets = readSecrets(),
    staging = `${dataDir}/staging`,
    started = performance.now();
  writeSnapshots(staging);
  if (mode === 'naive') {
    setupRepo(secrets, `${offsiteDir}/naive`);
    runRestic(secrets, ['-r', `${offsiteDir}/naive`, 'backup', '--host', 'nixie', staging]);
  } else {
    const dataRepo = `${offsiteDir}/data`,
      keysRepo = `${offsiteDir}/keys`;
    setupRepo(secrets, dataRepo);
    setupRepo(secrets, keysRepo);
    runRestic(secrets, ['-r', dataRepo, 'backup', '--host', 'nixie', `${staging}/nixie.db`]);
    runRestic(secrets, ['-r', dataRepo, 'forget', '--keep-daily', '7', '--keep-weekly', '4']);
    runRestic(secrets, ['-r', keysRepo, 'backup', '--host', 'nixie', `${staging}/keys.db`]);
    runRestic(secrets, [
      '-r',
      keysRepo,
      'forget',
      '--keep-last',
      '1',
      '--prune',
      '--max-unused',
      '0',
    ]);
  }
  rmSync(staging, { force: true, recursive: true });
  const backupMs = Math.round(performance.now() - started);
  console.log(JSON.stringify({ backupMs, mode }));
}

function findDatabaseFiles(dir: string): string[] {
  const result = Bun.spawnSync(['find', dir, '-type', 'f', '-name', '*.db']),
    text = result.stdout.toString().trim();
  return text.split('\n').filter(Boolean);
}

function runRestore(repo: string, snapshotId: string, dir: string): void {
  const secrets = readSecrets(),
    started = performance.now(),
    tmp = `${dir}/.restore`;
  runRestic(secrets, ['-r', `${offsiteDir}/${repo}`, 'restore', snapshotId, '--target', tmp]);
  const found = findDatabaseFiles(tmp);
  for (const file of found) {
    const name = file.split('/').at(-1) ?? '';
    renameSync(file, `${dir}/${name}`);
  }
  rmSync(tmp, { force: true, recursive: true });
  const restoreMs = Math.round(performance.now() - started);
  console.log(JSON.stringify({ files: found.length, repo, restoreMs }));
}

function printSnapshots(repo: string): void {
  const out = runRestic(readSecrets(), ['-r', `${offsiteDir}/${repo}`, 'snapshots', '--json']);
  console.log(out.trim());
}

async function printOfflineItems(dbPath: string, keysPath: string): Promise<void> {
  const secrets = readSecrets();
  const kek = await loadDeploymentKey(secrets);
  const db = new Database(dbPath, { readonly: true, strict: true }),
    keys = new Database(keysPath, { readonly: true, strict: true });
  const row = db.query('PRAGMA user_version').get() as { user_version: number },
    table = row.user_version >= 2 ? 'memory_items' : 'memory';
  const items = await readItems(db, keys, kek, table);
  console.log(JSON.stringify(items));
}

const [command = 'serve', ...args] = process.argv.slice(2);
if (command === 'serve') {
  await runServer();
} else if (command === 'healthcheck') {
  await checkHealth();
} else if (command === 'backup') {
  runBackup(args[0] ?? 'split');
} else if (command === 'restore') {
  runRestore(args[0] ?? 'data', args[1] ?? 'latest', args[2] ?? dataDir);
} else if (command === 'snapshots') {
  printSnapshots(args[0] ?? 'data');
} else if (command === 'read') {
  await printOfflineItems(args[0] ?? '', args[1] ?? '');
} else {
  throw new Error(`unknown command ${command}`);
}
