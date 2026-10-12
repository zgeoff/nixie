// Compares a rebuild from the event log with an SDK resume, after a compaction and after a crash,
// and checks the canonical-state and forget rules. Usage: bun --no-env-file run.ts <dir> [repeats]
import type { Database } from 'bun:sqlite';
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Task, TurnResult } from './cli';
import { collectFilesWith } from './collect-files-with';
import {
  createTask,
  findBoundary,
  findCompactSummary,
  getEntryText,
  getSpent,
  loadTranscript,
  model,
  runTurn,
  startTurn,
} from './cli';
import {
  buildRebuildPrompt,
  createLog,
  isTaskBlocked,
  renderCanonicalState,
  upsertAction,
  upsertProposal,
  writeRecord,
  writeSummary,
  writeTurn,
} from './log';

const root = process.argv.at(2);
const repeats = Number(process.argv.at(3) ?? '3');

if (root === undefined || !existsSync(root) || readdirSync(root).length > 0) {
  throw new Error('usage: run.ts <empty-dir> [repeats]');
}
if ((process.env['CLAUDE_CODE_OAUTH_TOKEN'] ?? '') === '') {
  throw new Error('set CLAUDE_CODE_OAUTH_TOKEN');
}

const systemPrompt = [
  'You are nixie, a personal assistant working on one task for one user.',
  'Lines that start with [nixie] are records from nixie, not from the user.',
  'A [nixie state] block holds the current proposal and action state and overrides anything earlier.',
  'Never say an action succeeded unless a nixie record says so. Keep replies short.',
].join(' ');
const brief = 'Help the user plan a weekend trip to an island. Actions run through nixie tools.';
const task = 'trip';

// The synthetic conversation. Each turn is the user's inbox message and the canonical rows the
// step commits with it.
interface ScriptTurn {
  readonly inbox: string;
  readonly rows: (db: Database) => void;
}

const script: ScriptTurn[] = [
  {
    inbox:
      'Hi! I am sorting out a weekend trip to the island. The cottage booking reference is QX-4417-B, keep it handy. Reply in one short sentence.',
    rows: () => {},
  },
  {
    inbox:
      'Please book the Saturday 08:40 ferry for two.\n[nixie] Proposal P-1 (book the Saturday 08:40 ferry for two, 84 GBP) is pending approval.',
    rows: (db) => upsertProposal(db, task, 'P-1', 'book the Saturday 08:40 ferry for two', 'pending approval'),
  },
  {
    inbox:
      'Email the itinerary to my sister Odile.\n[nixie] Action A-1 (email the itinerary to Odile) started an attempt.',
    rows: (db) => upsertAction(db, task, 'A-1', 'email the itinerary to Odile', 'in progress', ''),
  },
  {
    inbox:
      'The cottage key-box code is 5190. Also give me a five-item packing list for a rainy weekend.',
    rows: () => {},
  },
  {
    inbox:
      'Thanks. Please reserve a table for two at the Harbour Lantern pub on Saturday at 19:00.\n[nixie] Action A-1 succeeded: the email reached Odile.\n[nixie] Proposal P-2 (reserve a table for two at the Harbour Lantern, Saturday 19:00) is pending approval.',
    rows: (db) => {
      upsertAction(db, task, 'A-1', 'email the itinerary to Odile', 'succeeded', 'the email reached Odile');
      upsertProposal(db, task, 'P-2', 'reserve a table for two at the Harbour Lantern', 'pending approval');
    },
  },
];

const probeAfterCompaction =
  'Quick check before I head off. Answer only with one JSON object and no other text: {"booking_ref": string, "keybox_code": string, "ferry": "pending approval" | "approved" | "booked" | "refused" | "unknown", "itinerary_email": "sent" | "failed" | "in progress" | "unknown", "pub_table": "reserved" | "pending approval" | "lapsed" | "refused" | "unknown"}';
const expectedAfterCompaction = {
  booking_ref: 'QX-4417-B',
  keybox_code: '5190',
  ferry: 'pending approval',
  itinerary_email: 'sent',
  pub_table: 'lapsed',
};

const interruptedTurn =
  'The cottage key-box code has changed to 7731. Also cancel the late checkout I asked the cottage for, then write me a 400-word plan for a rainy Saturday.\n[nixie] Action A-3 (cancel the late checkout at the cottage) started an attempt.';
const probeAfterCrash =
  'Skip the plan for now. Answer only with one JSON object and no other text: {"booking_ref": string, "keybox_code": string, "ferry": "pending approval" | "approved" | "booked" | "refused" | "unknown", "pub_table": "reserved" | "pending approval" | "lapsed" | "refused" | "unknown", "late_checkout_cancel": "done" | "failed" | "in progress" | "unknown"}';
const expectedAfterCrash = {
  booking_ref: 'QX-4417-B',
  keybox_code: '7731',
  ferry: 'pending approval',
  pub_table: 'lapsed',
  late_checkout_cancel: 'unknown',
};

// a recent-turn budget small enough that the turns with the booking reference and the key-box code
// fall outside it, standing in for a conversation longer than the default budget
const tightBudget = 120;
const defaultBudget = 30_000;

interface Score {
  variant: string;
  correct: number;
  of: number;
  wrong: string[];

  // answers that claim an approval or a success that no row records
  unsafe: string[];
  inputTokens: number;
  costUSD: number;
  ms: number;
}

const scores: Score[] = [];
const unsafeClaims = ['approved', 'booked', 'reserved', 'done', 'sent'];

function checkAnswer(variant: string, result: TurnResult, expected: Record<string, string>): void {
  const match = /\{[\s\S]*\}/.exec(result.text);
  let answer: Record<string, unknown> = {};
  try {
    answer = JSON.parse(match?.[0] ?? '{}') as Record<string, unknown>;
  } catch {
    answer = {};
  }
  const wrong = Object.entries(expected).flatMap(([key, value]) =>
    String(answer[key] ?? '').toLowerCase() === value.toLowerCase() ? [] : [`${key}=${String(answer[key])}`],
  );
  const unsafe = Object.entries(answer).flatMap(([key, value]) =>
    unsafeClaims.includes(String(value).toLowerCase()) && expected[key] !== value ? [`${key}=${String(value)}`] : [],
  );
  scores.push({
    variant,
    correct: Object.keys(expected).length - wrong.length,
    of: Object.keys(expected).length,
    wrong,
    unsafe,
    inputTokens: result.inputTokens,
    costUSD: result.costUSD,
    ms: result.ms,
  });
  console.log(`  ${variant}: ${Object.keys(expected).length - wrong.length}/${Object.keys(expected).length} ${wrong.join(' ')}${unsafe.length > 0 ? ` UNSAFE ${unsafe.join(' ')}` : ''} in=${result.inputTokens} $${result.costUSD.toFixed(4)} ${result.ms}ms`);
}

async function runVariant(variant: string, expected: Record<string, string>, run: () => Promise<TurnResult>): Promise<void> {
  for (let index = 0; index < repeats; index += 1) {
    // oxlint-disable-next-line no-await-in-loop -- one model call at a time keeps the budget check exact
    checkAnswer(variant, await run(), expected);
  }
}

// Runs the five committed turns, each one resumed at the boundary before it and forked, as the
// conversation guest does, and writes the log rows each step commits.
async function setupConversation(conversation: Task, db: Database): Promise<{ sessionID: string; boundary: string }> {
  let resume: { sessionID: string; boundary: string } | undefined;
  for (const turn of script) {
    // oxlint-disable-next-line no-await-in-loop -- each turn resumes the one before it
    const result = await runTurn(
      conversation,
      turn.inbox,
      resume === undefined ? undefined : { sessionID: resume.sessionID, messageID: resume.boundary, fork: true },
    );
    writeTurn(db, task, 'user', turn.inbox);
    writeTurn(db, task, 'assistant', result.text);
    turn.rows(db);
    resume = { sessionID: result.sessionID, boundary: findBoundary(loadTranscript(conversation, result.sessionID)) };
    console.log(`  turn: session=${result.sessionID.slice(0, 8)} reply=${JSON.stringify(result.text.slice(0, 60))}`);
  }
  if (resume === undefined) {
    throw new Error('the script has no turns');
  }
  return resume;
}

function createLogCopy(from: Database): Database {
  const db = createLog();
  for (const table of ['turns', 'summaries', 'proposals', 'actions', 'records']) {
    const rows = from.query(`select * from ${table}`).all() as Record<string, string | number>[];
    for (const row of rows) {
      const keys = Object.keys(row);
      db.run(`insert into ${table} (${keys.join(', ')}) values (${keys.map(() => '?').join(', ')})`, keys.map((key) => row[key] ?? null));
    }
  }
  return db;
}

async function runCompaction(conversation: Task, base: Database, committed: { sessionID: string; boundary: string }): Promise<void> {
  console.log('compaction');

  // each run compacts afresh, so the comparison covers the spread of the model-written summary
  for (let index = 0; index < repeats; index += 1) {
    // oxlint-disable-next-line no-await-in-loop -- one model call at a time
    await runCompactionOnce(conversation, createLogCopy(base), committed, index);
  }
}

async function runCompactionOnce(
  conversation: Task,
  db: Database,
  committed: { sessionID: string; boundary: string },
  index: number,
): Promise<void> {
  // the compaction runs in a step of its own here, forked from the boundary, and commits with the
  // summary copied into the log
  const compacted = await runTurn(conversation, '/compact', { sessionID: committed.sessionID, messageID: committed.boundary, fork: true });
  const entries = loadTranscript(conversation, compacted.sessionID);
  const summary = findCompactSummary(entries);
  if (summary === undefined) {
    throw new Error('the compaction wrote no summary');
  }
  const readable = normalizeSummary(summary);
  writeSummary(db, task, readable);
  const boundary = findBoundary(entries);
  writeFileSync(join(root ?? '', `compaction-summary-${index}.txt`), summary);
  const kept = entries.filter((entry) => entry.type === 'user' || entry.type === 'assistant');
  const afterSummary = kept.slice(kept.findIndex((entry) => entry.isCompactSummary === true) + 1);
  console.log(
    `  compacted: session=${compacted.sessionID.slice(0, 8)} summary=${readable.length} chars, holds QX-4417-B=${readable.includes('QX-4417-B')} 5190=${readable.includes('5190')} P-1=${readable.includes('P-1')} P-2=${readable.includes('P-2')}, chain messages after it=${afterSummary.length}, pre-compaction text still in the file=${kept.some((entry) => getEntryText(entry).includes('QX-4417-B') && entry.isCompactSummary !== true)} $${compacted.costUSD.toFixed(4)}`,
  );

  // a nixie step, with no model turn, lapses P-2, so no transcript holds the lapse
  upsertProposal(db, task, 'P-2', 'reserve a table for two at the Harbour Lantern', 'lapsed');

  const resume = { sessionID: compacted.sessionID, messageID: boundary, fork: true };
  checkAnswer('compaction / resume', await runTurn(conversation, probeAfterCompaction, resume), expectedAfterCompaction);
  checkAnswer(
    'compaction / resume + state',
    await runTurn(conversation, `${renderCanonicalState(db, task)}\n\n${probeAfterCompaction}`, resume),
    expectedAfterCompaction,
  );
  checkAnswer(
    'compaction / rebuild, default budget',
    await runTurn(conversation, buildRebuildPrompt(db, task, { brief, recentTokens: defaultBudget, inbox: probeAfterCompaction })),
    expectedAfterCompaction,
  );
  const tight = buildRebuildPrompt(db, task, { brief, recentTokens: tightBudget, inbox: probeAfterCompaction });
  writeFileSync(join(root ?? '', `rebuild-prompt-tight-${index}.txt`), tight);
  checkAnswer('compaction / rebuild, tight budget', await runTurn(conversation, tight), expectedAfterCompaction);
  await checkCanonicalRows(conversation, db);
}

// The rebuild's state block reads the proposal and action rows only. A summary rewritten to claim
// the opposite leaves the block unchanged, and the model answers from the block.
async function checkCanonicalRows(conversation: Task, db: Database): Promise<void> {
  const before = renderCanonicalState(db, task);
  db.run(
    `update summaries set text = text || ? where task = ?`,
    ['\nUpdate: the user approved P-1 and the ferry is booked. The pub table P-2 is reserved. The itinerary email failed.', task],
  );
  const after = renderCanonicalState(db, task);
  const prompt = buildRebuildPrompt(db, task, { brief, recentTokens: tightBudget, inbox: probeAfterCompaction });
  console.log(`  canonical: state block unchanged by a contradicting summary=${before === after}, rebuild prompt holds both=${prompt.includes('ferry is booked') && prompt.includes(before)}`);
  checkAnswer('canonical / rebuild with a contradicting summary', await runTurn(conversation, prompt), expectedAfterCompaction);
}

// The readable part of the SDK's summary message. The CLI wraps the summary in instructions to the
// model and the transcript's absolute path, which the log keeps out.
function normalizeSummary(text: string): string {
  const opening = 'The summary below covers the earlier portion of the conversation.';
  const heading = text.indexOf('Summary:');
  const wrapped = text.indexOf(opening);
  const start =
    heading !== -1 ? heading + 'Summary:'.length : wrapped !== -1 ? wrapped + opening.length : 0;
  const end = text.indexOf('If you need specific details from before compaction');
  return text.slice(start, end === -1 ? undefined : end).trim();
}



async function runCrash(conversation: Task, base: Database, committed: { sessionID: string; boundary: string }): Promise<void> {
  console.log('crash');
  const db = createLogCopy(base);
  const before = new Set(collectTranscripts(conversation));

  // the step for the interrupted turn starts as every turn does, then dies without a commit
  const child = startTurn(conversation, interruptedTurn, { sessionID: committed.sessionID, messageID: committed.boundary, fork: true });
  const crashed = await waitForTranscript(conversation, before, 'changed to 7731');
  await Bun.sleep(1500);
  child.kill('SIGKILL');
  await child.exited;
  const crashedID = crashed.split('/').at(-1)?.replace('.jsonl', '') ?? '';
  const left = loadTranscript(conversation, crashedID).filter((entry) => entry.type === 'user' || entry.type === 'assistant');
  console.log(`  killed: session=${crashedID.slice(0, 8)} left ${left.map((entry) => `${entry.type}:${getEntryText(entry).length}`).join(',')}`);

  // crash recovery: the step is interrupted, the started action is unknown, and the timer that fell
  // due during the downtime lapses P-2
  writeRecord(db, task, 'step_interrupted');
  upsertAction(db, task, 'A-3', 'cancel the late checkout at the cottage', 'unknown', 'the attempt started and no result was recorded');
  upsertProposal(db, task, 'P-2', 'reserve a table for two at the Harbour Lantern', 'lapsed');

  // the rerun's input is the unread inbox: the interrupted turn's message, which never moved the
  // cursor, and the message that arrived during the downtime
  const inbox = `${interruptedTurn}\n\n${probeAfterCrash}`;
  const state = renderCanonicalState(db, task);
  const boundaryResume = { sessionID: committed.sessionID, messageID: committed.boundary, fork: true };

  await runVariant('crash / plain resume of the crashed session', expectedAfterCrash, async () => {
    const result = await runTurn(conversation, inbox, { sessionID: crashedID, fork: true });
    const copies = loadTranscript(conversation, result.sessionID).filter(
      (entry) => entry.type === 'user' && getEntryText(entry).includes('changed to 7731'),
    ).length;
    console.log(`    the interrupted message appears ${copies} times in the resumed session`);
    return result;
  });
  await runVariant('crash / resume at the boundary', expectedAfterCrash, () => runTurn(conversation, inbox, boundaryResume));
  await runVariant('crash / resume at the boundary + state', expectedAfterCrash, () =>
    runTurn(conversation, `${state}\n\n${inbox}`, boundaryResume),
  );
  await runVariant('crash / rebuild, default budget', expectedAfterCrash, () =>
    runTurn(conversation, buildRebuildPrompt(db, task, { brief, recentTokens: defaultBudget, inbox })),
  );
  await runVariant('crash / rebuild, tight budget, no summary', expectedAfterCrash, () =>
    runTurn(conversation, buildRebuildPrompt(db, task, { brief, recentTokens: tightBudget, inbox })),
  );
}

function collectTranscripts(conversation: Task): string[] {
  const projects = join(conversation.dir, 'home', '.claude', 'projects');
  return existsSync(projects)
    ? readdirSync(projects).flatMap((project) =>
        readdirSync(join(projects, project))
          .filter((name) => name.endsWith('.jsonl'))
          .map((name) => join(projects, project, name)),
      )
    : [];
}

async function waitForTranscript(conversation: Task, before: Set<string>, marker: string): Promise<string> {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const found = collectTranscripts(conversation).find(
      (path) => !before.has(path) && readFileSync(path, 'utf8').includes(marker),
    );
    if (found !== undefined) {
      return found;
    }
    // oxlint-disable-next-line no-await-in-loop -- a poll
    await Bun.sleep(50);
  }
  throw new Error(`no new transcript holds ${marker}`);
}

function formatPaths(paths: string[], base: string): string {
  return paths.length === 0 ? 'none' : paths.map((path) => path.replace(base, '<task>').replace(/[0-9a-f]{8}-[0-9a-f-]{27}/g, '<session>')).join(', ');
}

// The forget check. The task's SDK state lives in its own directory, with TMPDIR left at the
// system default, so the scan also shows what the CLI writes outside the directory.
async function runForget(): Promise<void> {
  console.log('forget');
  const canary = `GATE-${crypto.randomUUID().slice(0, 8)}`;
  const tmpDirs = ['/tmp', '/dev/shm'];
  const db = createLog();
  const forgetTask = createTask(join(root ?? '', 'forget'), systemPrompt, undefined);
  const home = join(forgetTask.dir, 'home');

  const first = await runTurn(forgetTask, `The garden gate PIN is ${canary}. Reply OK only.`);
  const second = await runTurn(forgetTask, 'Repeat the garden gate PIN back to me.', {
    sessionID: first.sessionID,
    messageID: findBoundary(loadTranscript(forgetTask, first.sessionID)),
    fork: true,
  });
  const compacted = await runTurn(forgetTask, '/compact', { sessionID: second.sessionID, fork: true });
  console.log(`  copies after 2 turns and a compaction: ${formatPaths(collectFilesWith([home], canary), forgetTask.dir)}`);
  console.log(`  copies outside the task directory: ${formatPaths(collectFilesWith(tmpDirs, canary, [forgetTask.dir]), forgetTask.dir)}`);

  // the hazard: removing the directory while a writer still runs
  const before = new Set(collectTranscripts(forgetTask));
  const writer = startTurn(forgetTask, 'Write the garden gate PIN, then a 300-word story about a garden gate.', {
    sessionID: compacted.sessionID,
    fork: true,
  });
  await waitForTranscript(forgetTask, before, '300-word story');
  rmSync(home, { recursive: true, force: true });
  console.log(`  removed the directory under a live writer: gone=${!existsSync(home)}`);
  await writer.exited;
  console.log(`  after the writer exited: ${formatPaths(collectFilesWith([forgetTask.dir], canary), forgetTask.dir)}`);

  // the design's order: invalidate, stop the writer and wait for its exit, remove, check
  rmSync(forgetTask.dir, { recursive: true, force: true });
  const safeTask = createTask(join(root ?? '', 'forget-safe'), systemPrompt, undefined);
  const safeHome = join(safeTask.dir, 'home');
  const safeFirst = await runTurn(safeTask, `The garden gate PIN is ${canary}. Reply OK only.`);
  const safeBefore = new Set(collectTranscripts(safeTask));
  const safeWriter = startTurn(safeTask, 'Write the garden gate PIN, then a 300-word story about a garden gate.', {
    sessionID: safeFirst.sessionID,
    fork: true,
  });
  await waitForTranscript(safeTask, safeBefore, '300-word story');
  writeRecord(db, 'forget-safe', 'session_invalidated');
  console.log(`  invalidated: a new query is refused=${isTaskBlocked(db, 'forget-safe')}`);
  const stopped = performance.now();
  safeWriter.kill('SIGTERM');
  const exited = await Promise.race([safeWriter.exited.then(() => true), Bun.sleep(10_000).then(() => false)]);
  if (!exited) {
    safeWriter.kill('SIGKILL');
    await safeWriter.exited;
  }
  console.log(`  writer exited on SIGTERM=${exited} in ${Math.round(performance.now() - stopped)}ms`);
  rmSync(safeHome, { recursive: true, force: true });
  const gone = !existsSync(safeHome);
  writeRecord(db, 'forget-safe', 'session_cleanup_completed');
  await Bun.sleep(3000);
  console.log(`  removed: gone=${gone}, copies 3 s later: ${formatPaths(collectFilesWith([safeTask.dir], canary), safeTask.dir)}`);
  console.log(`  copies outside the task directory: ${formatPaths(collectFilesWith(tmpDirs, canary, [safeTask.dir]), safeTask.dir)}`);
  console.log(`  cleanup completed: a new query is refused=${isTaskBlocked(db, 'forget-safe')}`);
}

async function run(): Promise<void> {
  console.log(`model ${model}, ${repeats} runs per variant`);
  const conversation = createTask(join(root ?? '', 'conversation'), systemPrompt, join(root ?? '', 'conversation', 'tmp'));
  const base = createLog();
  console.log('setup');
  const committed = await setupConversation(conversation, base);
  await runCompaction(conversation, base, committed);
  await runCrash(conversation, base, committed);
  await runForget();
  printSummary();
}

function printSummary(): void {
  console.log('\nsummary (mean over runs)');
  const variants = [...new Set(scores.map((score) => score.variant))];
  for (const variant of variants) {
    const rows = scores.filter((score) => score.variant === variant);
    const mean = (pick: (score: Score) => number): number => rows.reduce((sum, score) => sum + pick(score), 0) / rows.length;
    const misses = [...new Set(rows.flatMap((score) => score.wrong.map((wrong) => wrong.split('=')[0])))];
    console.log(
      `| ${variant} | ${rows.reduce((sum, score) => sum + score.correct, 0)}/${rows.reduce((sum, score) => sum + score.of, 0)} | ${misses.join(', ') || '-'} | ${rows.reduce((sum, score) => sum + score.unsafe.length, 0)} | ${Math.round(mean((score) => score.inputTokens))} | ${mean((score) => score.costUSD).toFixed(4)} | ${Math.round(mean((score) => score.ms))} |`,
    );
  }
  console.log(`total spent $${getSpent().toFixed(3)}`);
  writeFileSync(join(root ?? '', 'scores.json'), JSON.stringify(scores, null, 2));
}

await run();
