// A repository is a local directory: snapshots are JSON files, and each snapshot's content is a
// blob that a prune removes once no snapshot names it, so a test sees what restic's prune leaves.
import { appendFile, mkdir, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { z } from 'zod';

const repository = process.env['RESTIC_REPOSITORY'] ?? '';
const password = process.env['RESTIC_PASSWORD'] ?? '';
const callLog = process.env['STUB_RESTIC_LOG'];
const argv = process.argv.slice(2);

const parsed = parseArgs({
  args: argv,
  allowPositionals: true,
  options: {
    'no-cache': { type: 'boolean' },
    json: { type: 'boolean' },
    host: { type: 'string' },
    stdin: { type: 'boolean' },
    'stdin-filename': { type: 'string' },
    tag: { type: 'string', multiple: true },
    'group-by': { type: 'string' },
    'keep-hourly': { type: 'string' },
    'keep-daily': { type: 'string' },
    'keep-weekly': { type: 'string' },
    'keep-monthly': { type: 'string' },
    prune: { type: 'boolean' },
    'max-unused': { type: 'string' },
    'read-data': { type: 'boolean' },
  },
});

const [command = '', ...rest] = parsed.positionals;

const snapshotSchema = z.object({
  id: z.string(),
  hostname: z.string(),
  paths: z.array(z.string()),
  tags: z.array(z.string()),
  blob: z.string(),
});

type Snapshot = z.infer<typeof snapshotSchema>;

if (callLog !== undefined) {
  const call = JSON.stringify({ repository, args: argv, hasPassword: password !== '' });

  await appendFile(callLog, `${call}\n`);
}

if (process.env['STUB_RESTIC_FAIL'] === command) {
  fail(1, `Fatal: the stub fails ${command}`);
}

const configFile = Bun.file(join(repository, 'config'));

const hasConfig = await configFile.exists();

if (command === 'init') {
  if (hasConfig) {
    fail(1, 'Fatal: create repository failed: config file already exists');
  }

  await mkdir(join(repository, 'snapshots'), { recursive: true });
  await mkdir(join(repository, 'blobs'), { recursive: true });

  await Bun.write(configFile, JSON.stringify({ password }));

  process.exit(0);
}

if (!hasConfig) {
  fail(10, `Fatal: repository does not exist: unable to open config file: ${repository}`);
}

const configText = await configFile.text();

const config = z.object({ password: z.string() }).parse(JSON.parse(configText));

if (config.password !== password) {
  fail(12, 'Fatal: wrong password or no key found');
}

const snapshots = await readSnapshots();

if (command === 'cat' && rest[0] === 'config') {
  process.stdout.write(`${JSON.stringify({ version: 2 })}\n`);
} else if (command === 'backup') {
  const content = await new Response(Bun.stdin.stream()).arrayBuffer();

  const blob = new Bun.CryptoHasher('sha256').update(content).digest('hex');
  const id = new Bun.CryptoHasher('sha256').update(crypto.randomUUID()).digest('hex');

  await Bun.write(join(repository, 'blobs', blob), content);

  const snapshot: Snapshot = {
    id,
    hostname: parsed.values.host ?? 'stub-host',
    paths: [`/${parsed.values['stdin-filename'] ?? 'stdin'}`],
    tags: parsed.values.tag ?? [],
    blob,
  };

  await Bun.write(join(repository, 'snapshots', `${id}.json`), JSON.stringify(snapshot));

  process.stdout.write(`${JSON.stringify({ message_type: 'status', percent_done: 1 })}\n`);
  process.stdout.write(`${JSON.stringify({ message_type: 'summary', snapshot_id: id })}\n`);
} else if (command === 'snapshots') {
  process.stdout.write(`${JSON.stringify(snapshots)}\n`);
} else if (command === 'forget') {
  for (const id of rest) {
    await rm(join(repository, 'snapshots', `${id}.json`));
  }
} else if (command === 'prune') {
  const named = new Set(snapshots.map((snapshot) => snapshot.blob));

  const blobs = await readdir(join(repository, 'blobs'));

  for (const blob of blobs.filter((name) => !named.has(name))) {
    await rm(join(repository, 'blobs', blob));
  }
} else if (command === 'check') {
  const blobs = await readdir(join(repository, 'blobs'));

  const present = new Set(blobs);

  const missing = snapshots.find((snapshot) => !present.has(snapshot.blob));

  if (missing !== undefined) {
    fail(1, `Fatal: snapshot ${missing.id} names a missing blob`);
  }
} else if (command === 'dump') {
  const snapshot = snapshots.find((entry) => entry.id === rest[0]);

  if (snapshot === undefined) {
    fail(1, `Fatal: no snapshot ${rest[0] ?? ''}`);
  }

  const content = await Bun.file(join(repository, 'blobs', snapshot.blob)).bytes();

  process.stdout.write(content);
} else {
  fail(1, `Fatal: the stub runs no ${command}`);
}

async function readSnapshots(): Promise<readonly Snapshot[]> {
  const names = await readdir(join(repository, 'snapshots'));

  return Promise.all(
    names.map(async (name) => {
      const text = await Bun.file(join(repository, 'snapshots', name)).text();

      return snapshotSchema.parse(JSON.parse(text));
    }),
  );
}

function fail(code: number, message: string): never {
  process.stderr.write(`${message}\n`);
  process.exit(code);
}
