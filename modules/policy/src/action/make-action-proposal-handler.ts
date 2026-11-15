import type { Definitions, JSONObject, Log, LogRecord, RecordInput } from '@heynixie/log';
import { JSON_OBJECT_SCHEMA, readRecords, writeRecordsInTransaction } from '@heynixie/log';
import type {
  ApplyOutcome,
  ApplyRun,
  ProposalAnswerInput,
  ProposalBody,
  ProposalKindHandler,
  ProposalRefusal,
  SharedProposal,
} from '@heynixie/proposals';
import type { Transaction } from 'kysely';
import invariant from 'tiny-invariant';
import { z } from 'zod';
import { ruleBodySchema } from '../rule/rule-body-schema';
import type { Rule } from '../types';
import { actionAnsweredCodec } from './action-answered-codec';
import { actionLapsedCodec } from './action-lapsed-codec';
import { actionProposalLapseMs } from './action-proposal-lapse-ms';
import { actionProposedCodec } from './action-proposed-codec';
import { buildActionHash } from './build-action-hash';
import { buildActionProposalSentence } from './build-action-proposal-sentence';

interface AlwaysAllowChange {
  readonly ruleID: string;
  readonly rule: Omit<Rule, 'id'>;
  readonly reason: string;
}

// What an approval of an action proposal answers, for the queue to run.
export interface ApprovedActionFacts {
  // the proposal's ID, which is also the ID of the action it queues
  readonly proposalID: string;
  readonly taskID: string;
  readonly stepKey: string | null;
  readonly tool: string;
  readonly actionHash: string;
  readonly arguments: JSONObject;
  readonly callSequence: number;
  readonly riskClass: SharedProposal['riskClass'];
  readonly deadlineAt: number | null;
}

export interface ActionHandlerDeps {
  readonly log: Log;
  readonly definitions: () => Definitions;

  // Writes a record on the proposal's thread. A task that is still open takes it as an inbox record.
  readonly writeThreadRecord: (tx: Transaction<unknown>, input: RecordInput) => Promise<void>;

  // Adds the rule as a runtime change in the caller's transaction.
  readonly writeRule: (tx: Transaction<unknown>, change: AlwaysAllowChange) => Promise<void>;

  // Queues the approved action in the answer's transaction, or releases the action that the row
  // held, and returns the action's ID.
  readonly queueApproved: (
    tx: Transaction<unknown>,
    approved: ApprovedActionFacts,
  ) => Promise<string>;

  // Fails the action that a declined or lapsed row held, in the same transaction.
  readonly failHeld: (
    tx: Transaction<unknown>,
    row: SharedProposal,
    reason: 'declined' | 'lapsed',
  ) => Promise<void>;

  // runs after the answer commits, so a rule takes effect at once
  readonly runAfterRule: () => Promise<unknown>;

  // Runs in the answer's transaction for a Decline of a no_rule ask, which ends the habit that the
  // group's open proposed rule rests on.
  readonly writeGapDecline: (tx: Transaction<unknown>, groupHash: string) => Promise<void>;

  // Runs after the commit of an Approve or Decline of a no_rule ask, to check the group.
  readonly runGapCheck: (groupHash: string) => Promise<void>;
}

export function makeActionProposalHandler(deps: ActionHandlerDeps): ProposalKindHandler {
  return {
    family: 'action',
    lapseIntervalMs: actionProposalLapseMs,
    ownsTransaction: false,
    readBodies: async (db, rows) => {
      const records = await readProposedRecords(deps, db, rows);

      return new Map(rows.map((row) => [row.id, toBody(records.get(row.createdSequence))]));
    },
    readHashes: (_db, row) => Promise.resolve({ action: row.actionHash, rule: row.ruleHash }),
    approve: (run, row, answer) => writeAnswer(deps, run, row, answer),
    decline: (run, row, answer) => writeAnswer(deps, run, row, answer),
    lapse: async (tx, row) => {
      await writeRecordsInTransaction(tx, deps.log, [
        {
          kind: actionLapsedCodec.kind,
          definitions: deps.definitions(),
          ...(row.thread === null ? {} : { thread: row.thread }),
          payload: actionLapsedCodec.encode({ proposalID: row.id }),
        },
      ]);

      await deps.failHeld(tx, row, 'lapsed');
    },
  };
}

function readProposedRecords(
  deps: ActionHandlerDeps,
  db: Parameters<ProposalKindHandler['readBodies']>[0],
  rows: readonly SharedProposal[],
): Promise<ReadonlyMap<number, LogRecord>> {
  return readRecordsBySequence(
    deps,
    db,
    rows.map((row) => row.createdSequence),
  );
}

async function readRecordsBySequence(
  deps: ActionHandlerDeps,
  db: Parameters<ProposalKindHandler['readBodies']>[0],
  sequences: readonly number[],
): Promise<ReadonlyMap<number, LogRecord>> {
  if (sequences.length === 0) {
    return new Map();
  }

  const read = await readRecords(
    { ...deps.log, writer: { ...deps.log.writer, db } },
    { afterSequence: 0, sequences: [...sequences], limit: sequences.length },
  );

  return new Map(read.map((entry) => [entry.record.sequence, entry.record]));
}

function toBody(record: LogRecord | undefined): ProposalBody | null {
  const erasable = record === undefined ? null : findErasable(record);

  // A forget shreds the arguments and destinations, and a card without them shows another action.
  if (record === undefined || erasable === null) {
    return null;
  }

  const payload = actionProposedCodec.decode(record.payload);
  const destinations = erasable.destinations.map((destination) => destination.value);

  return {
    sentence: buildActionProposalSentence(payload.tool, payload.effects, destinations),
    fields: Object.fromEntries(
      Object.entries(erasable.input).map(([name, value]) => [name, toFieldText(value)]),
    ),
    ruleSentence: erasable.ruleSentence ?? null,
    approveLabel: buildActionApproveLabel(payload.tool, destinations[0]),
  };
}

const erasableSchema = z.object({
  input: z.record(z.string(), z.unknown()).default({}),
  destinations: z.object({ value: z.string() }).array().default([]),
  rule: z.record(z.string(), z.unknown()).optional(),
  ruleID: z.string().optional(),
  ruleSentence: z.string().optional(),
});

function findErasable(record: LogRecord): z.output<typeof erasableSchema> | null {
  if (record.erasable.status !== 'readable') {
    return null;
  }

  return erasableSchema.parse(record.erasable.fields);
}

function toFieldText(value: unknown): string {
  return typeof value === 'string' ? value : JSON.stringify(value);
}

function buildActionApproveLabel(tool: string, destination: string | undefined): string {
  return destination === undefined ? `Run ${tool}` : `Run ${tool} to ${destination}`;
}

async function writeAnswer(
  deps: ActionHandlerDeps,
  run: ApplyRun,
  row: SharedProposal,
  answer: ProposalAnswerInput,
): Promise<ApplyOutcome> {
  const tx = run.tx;

  invariant(tx, 'an action answers in the transaction that the core opens');
  invariant(answer.choice !== 'defer', 'a defer never reaches the handler');

  const isDeclined = answer.choice === 'decline';

  const records = await readProposedRecords(deps, tx, [row]);

  const proposed = records.get(row.createdSequence);

  invariant(proposed, 'an action proposal has its record');

  const payload = actionProposedCodec.decode(proposed.payload);
  const rule = answer.choice === 'always_allow' ? findRule(proposed) : null;
  const groupHash = answer.choice === 'always_allow' ? undefined : payload.groupHash;

  if (answer.choice === 'always_allow' && rule === null) {
    return { status: 'refused', refusal: { error: 'NOT_ALLOWED', reason: 'rule_gone' } };
  }

  const queued = isDeclined ? null : await queueAction(deps, tx, { row, proposed, payload });

  if (queued !== null && queued.status === 'refused') {
    return { status: 'refused', refusal: queued.refusal };
  }

  if (isDeclined) {
    await deps.failHeld(tx, row, 'declined');
  }

  await deps.writeThreadRecord(tx, {
    kind: actionAnsweredCodec.kind,
    definitions: deps.definitions(),
    ...(row.thread === null ? {} : { thread: row.thread }),
    parent: payload.callSequence,
    payload: actionAnsweredCodec.encode({
      proposalID: row.id,
      shortID: row.shortID,
      answer: isDeclined ? 'declined' : 'approved',
      identityID: answer.identityID,
      choice: answer.choice,
      ...(groupHash === undefined ? {} : { groupHash }),
      ...(queued === null ? {} : { actionID: queued.actionID }),
    }),
    ...(isDeclined && answer.note !== undefined ? { erasable: { reason: answer.note } } : {}),
  });

  if (isDeclined && groupHash !== undefined) {
    await deps.writeGapDecline(tx, groupHash);
  }

  const afterGap = async (): Promise<void> => {
    if (groupHash !== undefined) {
      await deps.runGapCheck(groupHash);
    }
  };

  if (isDeclined) {
    return {
      status: 'done',
      result: { proposalID: row.id, state: 'declined' },
      afterCommit: afterGap,
    };
  }

  if (rule === null) {
    return {
      status: 'done',
      result: { proposalID: row.id, state: 'approved' },
      afterCommit: afterGap,
    };
  }

  await deps.writeRule(tx, {
    ruleID: rule.ruleID,
    rule: rule.rule,
    reason: `Always allow, from the proposal ${row.shortID}`,
  });

  return {
    status: 'done',
    result: { proposalID: row.id, state: 'approved', rule: { id: rule.ruleID, revision: 1 } },
    afterCommit: async () => {
      await deps.runAfterRule();
    },
  };
}

function findRule(
  record: LogRecord,
): { readonly ruleID: string; readonly rule: Omit<Rule, 'id'> } | null {
  const fields = findErasable(record);

  if (fields?.rule === undefined || fields.ruleID === undefined) {
    return null;
  }

  const { id: _id, ...body } = fields.rule;

  return { ruleID: fields.ruleID, rule: ruleBodySchema.parse(body) };
}

interface QueueRequest {
  readonly row: SharedProposal;
  readonly proposed: LogRecord;
  readonly payload: ReturnType<typeof actionProposedCodec.decode>;
}

type Queued =
  | { readonly status: 'queued'; readonly actionID: string }
  | { readonly status: 'refused'; readonly refusal: ProposalRefusal };

// An approval queues the action it answered, once: the answer's transaction is the guard, because a
// second answer finds the row closed.
async function queueAction(
  deps: ActionHandlerDeps,
  tx: Transaction<unknown>,
  request: QueueRequest,
): Promise<Queued> {
  const row = request.row;
  const payload = request.payload;
  const erasable = findErasable(request.proposed);

  // A forget shreds the arguments, and an action without them would run another.
  if (erasable === null || row.thread === null) {
    return { status: 'refused', refusal: { error: 'NOT_ALLOWED', reason: 'arguments_gone' } };
  }

  const hash = buildActionHash({
    tool: payload.tool,
    input: toJSONObject(erasable.input),
    destinations: erasable.destinations.map((destination) => destination.value),
    deadlineAt: payload.deadlineAt ?? null,
  });

  if (hash !== row.actionHash) {
    return { status: 'refused', refusal: { error: 'NOT_ALLOWED', reason: 'action_changed' } };
  }

  const actionID = await deps.queueApproved(tx, {
    proposalID: row.id,
    taskID: row.thread,
    stepKey: payload.stepKey ?? null,
    tool: payload.tool,
    actionHash: row.actionHash,
    arguments: toJSONObject(erasable.input),
    callSequence: payload.callSequence,
    riskClass: row.riskClass,
    deadlineAt: payload.deadlineAt ?? null,
  });

  return { status: 'queued', actionID };
}

function toJSONObject(value: Record<string, unknown>): JSONObject {
  return JSON_OBJECT_SCHEMA.parse(value);
}
