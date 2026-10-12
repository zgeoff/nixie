// A stand-in for the task's event log: the readable turns, the compaction summaries, and the
// canonical proposal, action and session rows that a recovery reads.
import { Database } from 'bun:sqlite';

export function createLog(): Database {
  const db = new Database(':memory:');
  db.run(`create table turns (seq integer primary key, task text, role text, text text)`);
  db.run(`create table summaries (seq integer primary key, task text, after_turn integer, text text)`);
  db.run(`create table proposals (id text primary key, task text, effect text, state text)`);
  db.run(`create table actions (id text primary key, task text, effect text, state text, result text)`);
  db.run(`create table records (seq integer primary key, task text, kind text, session text)`);
  return db;
}

export function writeTurn(db: Database, task: string, role: 'user' | 'assistant', text: string): void {
  db.run('insert into turns (task, role, text) values (?, ?, ?)', [task, role, text]);
}

export function writeSummary(db: Database, task: string, text: string): void {
  const last = db.query('select max(seq) as seq from turns where task = ?').get(task) as { seq: number };
  db.run('insert into summaries (task, after_turn, text) values (?, ?, ?)', [task, last.seq, text]);
}

export function upsertProposal(db: Database, task: string, id: string, effect: string, state: string): void {
  db.run(
    'insert into proposals (id, task, effect, state) values (?, ?, ?, ?) on conflict (id) do update set state = excluded.state',
    [id, task, effect, state],
  );
}

export function upsertAction(
  db: Database,
  task: string,
  id: string,
  effect: string,
  state: string,
  result: string,
): void {
  db.run(
    'insert into actions (id, task, effect, state, result) values (?, ?, ?, ?, ?) on conflict (id) do update set state = excluded.state, result = excluded.result',
    [id, task, effect, state, result],
  );
}

export function writeRecord(db: Database, task: string, kind: string): void {
  db.run('insert into records (task, kind, session) values (?, ?, ?)', [task, kind, '']);
}

// A forget's session_invalidated record blocks every query and resume for the task until a
// session_cleanup_completed record follows it; the task then starts a fresh session.
export function isTaskBlocked(db: Database, task: string): boolean {
  const last = db
    .query(
      `select kind from records where task = ? and kind in ('session_invalidated', 'session_cleanup_completed') order by seq desc limit 1`,
    )
    .get(task) as { kind: string } | null;
  return last?.kind === 'session_invalidated';
}

// The canonical state block. It reads only the proposal and action rows, never a summary or a
// transcript, so a stale summary cannot change it.
export function renderCanonicalState(db: Database, task: string): string {
  const proposals = db
    .query('select id, effect, state from proposals where task = ? order by id')
    .all(task) as { id: string; effect: string; state: string }[];
  const actions = db
    .query('select id, effect, state, result from actions where task = ? order by id')
    .all(task) as { id: string; effect: string; state: string; result: string }[];
  const lines = [
    '[nixie state] The current state from nixie records. It overrides anything earlier in this conversation.',
    ...proposals.map((row) => `- Proposal ${row.id} (${row.effect}): ${row.state}`),
    ...actions.map((row) => `- Action ${row.id} (${row.effect}): ${row.state}${row.result === '' ? '' : `, ${row.result}`}`),
  ];
  return lines.join('\n');
}

export interface RebuildInput {
  readonly brief: string;

  // the recent-turn budget in tokens, estimated at 4 characters a token
  readonly recentTokens: number;
  readonly inbox: string;
}

// The first turn of a rebuilt session: the brief, the latest summary from before the recent
// turns, the recent turns word for word, the unread inbox and the canonical state.
export function buildRebuildPrompt(db: Database, task: string, input: RebuildInput): string {
  const turns = db.query('select seq, role, text from turns where task = ? order by seq desc').all(task) as {
    seq: number;
    role: string;
    text: string;
  }[];
  const recent: typeof turns = [];
  let used = 0;
  for (const turn of turns) {
    const cost = Math.ceil(turn.text.length / 4);
    if (used + cost > input.recentTokens) {
      break;
    }
    used += cost;
    recent.unshift(turn);
  }
  // a summary that covers the recent turns too still holds the older ones, so the latest one goes in
  const summary =
    recent.length === turns.length
      ? undefined
      : (db
          .query('select text from summaries where task = ? order by seq desc limit 1')
          .get(task) as { text: string } | null);
  return [
    '[nixie rebuild] This session was rebuilt from nixie records.',
    `Task brief: ${input.brief}`,
    summary === undefined || summary === null
      ? ''
      : `Summary of the conversation before the recent turns:\n${summary.text}`,
    `Recent turns, word for word:\n${recent.map((turn) => `${turn.role}: ${turn.text}`).join('\n\n')}`,
    renderCanonicalState(db, task),
    `Unread inbox:\n${input.inbox}`,
  ]
    .filter((part) => part !== '')
    .join('\n\n');
}
