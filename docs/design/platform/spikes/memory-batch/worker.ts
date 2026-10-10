/* oxlint-disable one-var -- declarations follow argument guards and fault checkpoints */
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Candidate } from './store.ts';
import { checkCandidate, createBatch, createStore, getCursor, getReceipt } from './store.ts';

const [path, dir, fault = 'none', mode = 'capture'] = process.argv.slice(2);
if (!path || !dir) {
  throw new Error('usage: bun worker.ts <database> <artifacts> <fault> <capture|rollover>');
}
const db = createStore(path);
const batch = createBatch(db);
if (!batch) {
  db.close();
  process.exit(0);
}
function runFault(point: string): void {
  if (fault === point) {
    process.kill(process.pid, 'SIGKILL');
  }
}
runFault('after-plan');

// This file is deterministic stand-in model output, not a language-model extraction result.
appendFileSync(join(dir, 'attempts.log'), `${batch.key}\n`);
const candidates = JSON.parse(readFileSync(join(dir, 'candidates.json'), 'utf8')) as Candidate[];
runFault('after-output');
let session: string | null = null;
if (mode === 'rollover') {
  // Stand-in session artifact: no SDK process, summary quality or external actions are tested.
  session = `session-${batch.key.replace(':', '-')}`;
  writeFileSync(
    join(dir, `${session}.json`),
    JSON.stringify({ batch: batch.key, summary: 'fixture' }),
  );
}
runFault('after-session');

// Broken control: a committed cursor followed by a crash loses the whole batch.
if (fault === 'broken-cursor-first') {
  db.query('UPDATE state SET cursor = ?').run(batch.end);
  db.query("UPDATE batches SET status = 'done' WHERE key = ?").run(batch.key);
  process.kill(process.pid, 'SIGKILL');
}

db.transaction(() => {
  if (getCursor(db) !== batch.start) {
    throw new Error('stale batch cursor');
  }

  // Re-read original sources inside the publication transaction, including forget eligibility.
  for (const [index, candidate] of candidates.toSorted((a, b) => a.source - b.source).entries()) {
    if (checkCandidate(db, batch, candidate)) {
      db.query('INSERT OR IGNORE INTO proposals VALUES (?, ?, ?, ?, ?, ?)').run(
        getReceipt(batch, candidate),
        batch.key,
        candidate.source,
        candidate.quote,
        candidate.memory,
        'needs-assertion-check',
      );
    }
    if (index === 0) {
      runFault('inside-commit');
    }
  }
  db.query('UPDATE state SET cursor = ?, session = COALESCE(?, session)').run(batch.end, session);
  db.query("UPDATE batches SET status = 'done', session = ? WHERE key = ?").run(session, batch.key);
  runFault('before-commit');
}).immediate();
runFault('after-commit');
db.close();
