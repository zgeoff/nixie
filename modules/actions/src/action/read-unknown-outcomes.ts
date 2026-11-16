import type { JSONObject, Log, LogRecord } from '@heynixie/log';
import { readRecords } from '@heynixie/log';
import { z } from 'zod';
import type { ActionRiskClass, ActionsTables, CheckAnswer, OwnerReason } from '../types';
import { isJSONObject } from './is-json-object';

export interface UnknownOutcomeAttempt {
  readonly attempt: number;
  readonly at: number;
}

export interface UnknownOutcomeCheck {
  readonly answer: CheckAnswer;
  readonly at: number;
}

// An action whose outcome nixie could not settle, with what the owner needs to say whether it
// happened.
export interface UnknownOutcome {
  readonly actionID: string;
  readonly taskID: string;
  readonly tool: string;
  readonly effects: readonly string[];

  // empty when a forget removed the arguments or the destinations
  readonly destinations: readonly string[];
  readonly fields: Readonly<Record<string, string>>;
  readonly riskClass: ActionRiskClass;
  readonly ownerReason: OwnerReason;
  readonly becameUnknownAt: number;
  readonly attempts: readonly UnknownOutcomeAttempt[];
  readonly checks: readonly UnknownOutcomeCheck[];
}

// The actions that reached the owner as unknown and wait for an answer, oldest first.
export async function readUnknownOutcomes(log: Log): Promise<readonly UnknownOutcome[]> {
  const rows = await readWaitingRows(log);

  const outcomes: UnknownOutcome[] = [];

  for (const row of rows) {
    const outcome = await readUnknownOutcome(log, row);

    outcomes.push(outcome);
  }

  return outcomes;
}

function readWaitingRows(log: Log) {
  return log.writer.db
    .$extendTables<ActionsTables>()
    .selectFrom('actions')
    .selectAll()
    .where('status', '=', 'unknown')
    .where('outcome_sequence', 'is not', null)
    .orderBy('outcome_sequence')
    .execute();
}

type ActionRow = Awaited<ReturnType<typeof readWaitingRows>>[number];

async function readUnknownOutcome(log: Log, row: ActionRow): Promise<UnknownOutcome> {
  const sequences = [row.queued_sequence, row.outcome_sequence, row.call_sequence].filter(
    (sequence) => sequence !== null,
  );

  const records = await readRecords(log, { afterSequence: 0, sequences, limit: sequences.length });

  const bySequence = new Map(records.map((entry) => [entry.record.sequence, entry.record]));

  const queued = bySequence.get(row.queued_sequence);
  const outcome = row.outcome_sequence === null ? undefined : bySequence.get(row.outcome_sequence);
  const call = row.call_sequence === null ? undefined : bySequence.get(row.call_sequence);

  const history = await readHistory(log, row);

  return {
    actionID: row.action_id,
    taskID: row.task_id,
    tool: row.tool,
    effects: readEffects(queued),
    destinations: readDestinations(call),
    fields: readFields(queued),
    riskClass: row.risk_class,
    ownerReason: readOwnerReason(outcome),
    becameUnknownAt: outcome?.recordedAt.getTime() ?? 0,
    attempts: history.attempts,
    checks: history.checks,
  };
}

interface History {
  readonly attempts: readonly UnknownOutcomeAttempt[];
  readonly checks: readonly UnknownOutcomeCheck[];
}

const checkAnswerSchema = z.enum(['found', 'not_found', 'inconclusive']);

async function readHistory(log: Log, row: ActionRow): Promise<History> {
  const entries = await readRecords(log, {
    afterSequence: row.queued_sequence - 1,
    thread: row.task_id,
    kinds: ['action.attempt_started', 'action.reconcile_checked'],
    limit: 1000,
  });

  const mine = entries
    .map((entry) => entry.record)
    .filter((record) => record.payload['actionID'] === row.action_id);

  const attempts: UnknownOutcomeAttempt[] = [];
  const checks: UnknownOutcomeCheck[] = [];

  for (const record of mine) {
    const at = record.recordedAt.getTime();

    if (record.kind === 'action.attempt_started') {
      const attempt = z.number().safeParse(record.payload['attempt']);

      attempts.push({ attempt: attempt.success ? attempt.data : 0, at });
    } else {
      const answer = checkAnswerSchema.safeParse(record.payload['answer']);

      checks.push({ answer: answer.success ? answer.data : 'inconclusive', at });
    }
  }

  return { attempts, checks };
}

function readEffects(queued: LogRecord | undefined): readonly string[] {
  const parsed = z.string().array().safeParse(queued?.payload['effects']);

  return parsed.success ? parsed.data : [];
}

const destinationsSchema = z.object({ value: z.string() }).array();

function readDestinations(call: LogRecord | undefined): readonly string[] {
  if (call === undefined || call.erasable.status !== 'readable') {
    return [];
  }

  const parsed = destinationsSchema.safeParse(call.erasable.fields['destinations']);

  return parsed.success ? parsed.data.map((destination) => destination.value) : [];
}

function readFields(queued: LogRecord | undefined): Readonly<Record<string, string>> {
  if (queued === undefined || queued.erasable.status !== 'readable') {
    return {};
  }

  const args = queued.erasable.fields['arguments'];

  return isJSONObject(args) ? toFieldTexts(args) : {};
}

function toFieldTexts(args: JSONObject): Readonly<Record<string, string>> {
  return Object.fromEntries(
    Object.entries(args).map(([name, value]) => [
      name,
      typeof value === 'string' ? value : JSON.stringify(value),
    ]),
  );
}

const ownerReasonSchema = z.enum([
  'inconclusive',
  'unknown_streak',
  'no_reconcile',
  'key_expired',
  'not_found_ask',
]);

function readOwnerReason(outcome: LogRecord | undefined): OwnerReason {
  const parsed = ownerReasonSchema.safeParse(outcome?.payload['ownerReason']);

  return parsed.success ? parsed.data : 'no_reconcile';
}
