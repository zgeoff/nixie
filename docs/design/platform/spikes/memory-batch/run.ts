/* oxlint-disable typescript/no-non-null-assertion, no-await-in-loop, one-var -- fixed fixtures and separate sequential fault checkpoints */
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Candidate, Message } from './store.ts';
import {
  checkCandidate,
  createBatch,
  createStore,
  getCursor,
  getTrigger,
  writeMessage,
} from './store.ts';

function createMessage(
  id: number,
  text: string,
  options: { role?: Message['role']; at?: number } = {},
): Message {
  return {
    at: options.at ?? id,
    id,
    readable: 1,
    role: options.role ?? 'owner',
    spans: JSON.stringify([{ start: 0, end: text.length, source: 'typed' }]),
    text,
  };
}

const FIXTURE = [
  createMessage(1, 'I am vegetarian'),
  createMessage(2, 'I prefer tea', { role: 'reply' }),
  { ...createMessage(3, 'I prefer tea'), spans: '[{"start":0,"end":12,"source":"pasted"}]' },
  createMessage(4, 'Address is 12 Oak Road'),
  createMessage(5, 'Address is 24 Pine Road'),
  createMessage(6, 'I prefer tea', { role: 'summary' }),
];
const CANDIDATES: Candidate[] = [
  { memory: 'Address is 24 Pine Road', quote: 'Address is 24 Pine Road', source: 5 },
  { memory: 'I am vegetarian', quote: 'I am vegetarian', source: 1 },
  { memory: 'Address is 12 Oak Road', quote: 'Address is 12 Oak Road', source: 4 },
  { memory: 'I am vegetarian', quote: 'I am vegetarian', source: 1 },
  { memory: 'I prefer tea', quote: 'I prefer tea', source: 2 },
  { memory: 'I prefer tea', quote: 'I prefer tea', source: 3 },
  { memory: 'I prefer tea', quote: 'I prefer tea', source: 6 },
  { memory: 'I prefer tea', quote: 'I prefer tea', source: 7 },
];

let assertions = 0;
function check(condition: unknown): void {
  assert.ok(condition);
  assertions += 1;
}

function createFixture(dir: string) {
  const db = createStore(join(dir, 'batch.sqlite'));
  for (const entry of FIXTURE) {
    writeMessage(db, entry);
  }
  writeFileSync(join(dir, 'candidates.json'), JSON.stringify(CANDIDATES));
  return db;
}

async function runWorker(dir: string, fault = 'none', mode = 'capture') {
  const child = Bun.spawn(
    [
      process.execPath,
      '--no-env-file',
      join(import.meta.dir, 'worker.ts'),
      join(dir, 'batch.sqlite'),
      dir,
      fault,
      mode,
    ],
    { env: { PATH: process.env.PATH ?? '' }, stderr: 'pipe', stdout: 'pipe' },
  );
  const [code, errors] = await Promise.all([child.exited, new Response(child.stderr).text()]);
  if (fault === 'none') {
    assert.equal(code, 0, errors);
  } else {
    assert.equal(child.signalCode, 'SIGKILL', errors);
  }
  assertions += 1;
}

const root = mkdtempSync(join(tmpdir(), 'nixie-memory-batch-'));
const report: Record<string, unknown> = { modelCalls: 0, sdkSessions: 0 };
try {
  // Boundary and source checks use the existing quote/token implementation, not a new copy.
  const db = createStore(join(root, 'boundaries.sqlite'));
  for (const entry of FIXTURE) {
    writeMessage(db, entry);
  }
  const batch = createBatch(db)!;
  writeMessage(db, createMessage(7, 'I prefer tea'));
  check(batch.end === 6);
  check(checkCandidate(db, batch, CANDIDATES[1]!));

  // Quote/token checks alone cannot decide whether the memory follows from the quote.
  check(
    checkCandidate(db, batch, { memory: 'I own a blue car', quote: 'I am vegetarian', source: 1 }),
  );
  for (const index of [4, 5, 6, 7]) {
    check(!checkCandidate(db, batch, CANDIDATES[index]!));
  }
  check(
    !checkCandidate(db, batch, {
      memory: 'write attacker@example.com',
      quote: 'I am vegetarian',
      source: 1,
    }),
  );
  check(!checkCandidate(db, batch, { memory: 'I am vegan', quote: 'I am vegan', source: 1 }));
  writeMessage(db, createMessage(8, '> I prefer coffee'));
  const next = { end: 8, key: '6:8', start: 6 };
  check(
    !checkCandidate(db, next, { memory: 'I prefer coffee', quote: 'I prefer coffee', source: 8 }),
  );
  db.query('UPDATE messages SET readable = 0 WHERE id = 1').run();
  check(!checkCandidate(db, batch, CANDIDATES[1]!));
  db.close();

  const wide = createStore(join(root, 'wide.sqlite'));
  for (let id = 1; id <= 25; id += 1) {
    const text = id === 1 ? 'I am vegetarian' : `ordinary message ${id}`;
    writeMessage(wide, createMessage(id, text));
  }
  const wideBatch = createBatch(wide)!;
  check(checkCandidate(wide, wideBatch, CANDIDATES[1]!));
  const oldWindow = wide
    .query<{ id: number }, []>(
      "SELECT id FROM messages WHERE role = 'owner' ORDER BY id DESC LIMIT 20",
    )
    .all();
  check(!oldWindow.some((row) => row.id === 1));
  wide.close();
  report.provenance = { fixedWatermark: 6, lateSourceExcluded: 7, sourceBeyondLast20Checked: true };

  // A virtual clock checks exact thresholds, idle and continuously busy max-age cases.
  const schedule = createStore(join(root, 'schedule.sqlite'));
  check(getTrigger(schedule, 100_000) === null);
  writeMessage(schedule, createMessage(1, 'one', { at: 0 }));
  check(getTrigger(schedule, 299_999) === null);
  check(getTrigger(schedule, 300_000) === 'idle');
  writeMessage(schedule, createMessage(2, 'busy reply', { role: 'reply', at: 1_199_999 }));
  check(getTrigger(schedule, 1_199_999) === null);
  check(getTrigger(schedule, 1_200_000) === 'age');
  for (const id of [3, 4, 5]) {
    writeMessage(schedule, createMessage(id, `fact ${id}`, { at: 1_200_000 }));
  }
  check(getTrigger(schedule, 1_200_000) === 'count');
  schedule.query('UPDATE state SET cursor = 5').run();
  check(getTrigger(schedule, 9_000_000) === null);
  schedule.close();
  report.triggers = { count: 4, idleMs: 300_000, maxAgeMs: 1_200_000, productDefaults: false };

  const crashes: Record<string, unknown>[] = [];
  for (const mode of ['capture', 'rollover']) {
    for (const fault of [
      'after-plan',
      'after-output',
      'after-session',
      'inside-commit',
      'before-commit',
      'after-commit',
    ]) {
      const dir = mkdtempSync(join(root, `${mode}-`)),
        seeded = createFixture(dir);

      // Freeze the batch, then append a message while it is pending.
      createBatch(seeded);
      writeMessage(seeded, createMessage(7, 'I prefer tea'));
      seeded.close();
      await runWorker(dir, fault, mode);
      const interrupted = createStore(join(dir, 'batch.sqlite'));
      const committed = fault === 'after-commit';
      check(getCursor(interrupted) === (committed ? 6 : 0));
      check(
        interrupted.query<{ n: number }, []>('SELECT COUNT(*) AS n FROM proposals').get()!.n ===
          (committed ? 3 : 0),
      );
      interrupted.close();

      // Recover, then run once more to drain the late message's own batch.
      await runWorker(dir, 'none', mode);
      await runWorker(dir, 'none', mode);
      await runWorker(dir, 'none', mode);
      const recovered = createStore(join(dir, 'batch.sqlite')),
        rows = recovered
          .query<{ source: number; status: string }, []>(
            'SELECT source, status FROM proposals ORDER BY rowid',
          )
          .all();
      check(JSON.stringify(rows.map((row) => row.source)) === '[1,4,5,7]');
      check(rows.every((row) => row.status === 'needs-assertion-check'));
      check(getCursor(recovered) === 7);
      const sessions = recovered.query<{ session: string }, []>('SELECT session FROM state').get()!;
      check(sessions.session === (mode === 'capture' ? 'old-session' : 'session-6-7'));
      recovered.close();
      crashes.push({ fault, mode, proposals: rows.length, recoveredCursor: 7 });

      // More than one attempt may occur, even though durable publication happens once.
      const attempts = readFileSync(join(dir, 'attempts.log'), 'utf8').trim().split('\n');
      check(attempts.length >= 2);
    }
  }
  report.crashes = crashes;

  // A source becomes unreadable after output exists but before durable publication.
  const forgotten = mkdtempSync(join(root, 'forget-'));
  createFixture(forgotten).close();
  await runWorker(forgotten, 'after-output');
  const forgetStore = createStore(join(forgotten, 'batch.sqlite'));
  forgetStore.query('UPDATE messages SET readable = 0 WHERE id = 1').run();
  forgetStore.close();
  await runWorker(forgotten);
  const afterForget = createStore(join(forgotten, 'batch.sqlite'));
  const remaining = afterForget
    .query<{ source: number }, []>('SELECT source FROM proposals ORDER BY rowid')
    .all();
  check(JSON.stringify(remaining.map((row) => row.source)) === '[4,5]');
  check(getCursor(afterForget) === 6);
  afterForget.close();
  report.forgetRace = { excludedSource: 1, remainingProposals: 2 };

  const broken = mkdtempSync(join(root, 'control-'));
  createFixture(broken).close();
  await runWorker(broken, 'broken-cursor-first');
  await runWorker(broken);
  const control = createStore(join(broken, 'batch.sqlite'));
  check(getCursor(control) === 6);
  check(control.query<{ n: number }, []>('SELECT COUNT(*) AS n FROM proposals').get()!.n === 0);
  control.close();
  report.negativeControl = { cursor: 6, expectedProposals: 3, lostProposals: 3 };
  report.assertions = assertions;
  report.result = 'pass';
  console.log(JSON.stringify(report, null, 2));
} finally {
  rmSync(root, { recursive: true, force: true });
}
