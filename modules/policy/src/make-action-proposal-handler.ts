import type { Definitions, Log, LogRecord, RecordInput } from '@heynixie/log';
import { readRecords, writeRecordsInTransaction } from '@heynixie/log';
import type {
  ApplyOutcome,
  ApplyRun,
  ProposalAnswerInput,
  ProposalBody,
  ProposalKindHandler,
  SharedProposal,
} from '@heynixie/proposals';
import type { Transaction } from 'kysely';
import invariant from 'tiny-invariant';
import { z } from 'zod';
import { actionAnsweredCodec } from './action-answered-codec';
import { actionLapsedCodec } from './action-lapsed-codec';
import { actionProposalLapseMs } from './action-proposal-lapse-ms';
import { actionProposedCodec } from './action-proposed-codec';
import { buildActionProposalSentence } from './build-action-proposal-sentence';
import { ruleBodySchema } from './rule-body-schema';
import type { Rule } from './types';

interface AlwaysAllowChange {
  readonly ruleID: string;
  readonly rule: Omit<Rule, 'id'>;
  readonly reason: string;
}

export interface ActionHandlerDeps {
  readonly log: Log;
  readonly definitions: () => Definitions;

  // Writes a record on the proposal's thread. A task that is still open takes it as an inbox record.
  readonly writeThreadRecord: (tx: Transaction<unknown>, input: RecordInput) => Promise<void>;

  // Adds the rule as a runtime change in the caller's transaction.
  readonly writeRule: (tx: Transaction<unknown>, change: AlwaysAllowChange) => Promise<void>;

  // runs after the answer commits, so a rule takes effect at once
  readonly runAfterRule: () => Promise<unknown>;
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
    },
  };
}

async function readProposedRecords(
  deps: ActionHandlerDeps,
  db: Parameters<ProposalKindHandler['readBodies']>[0],
  rows: readonly SharedProposal[],
): Promise<ReadonlyMap<number, LogRecord>> {
  if (rows.length === 0) {
    return new Map();
  }

  const read = await readRecords(
    { ...deps.log, writer: { ...deps.log.writer, db } },
    {
      afterSequence: 0,
      sequences: rows.map((row) => row.createdSequence),
      limit: rows.length,
    },
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

async function writeAnswer(
  deps: ActionHandlerDeps,
  run: ApplyRun,
  row: SharedProposal,
  answer: ProposalAnswerInput,
): Promise<ApplyOutcome> {
  const tx = run.tx;

  invariant(tx, 'an action answers in the transaction that the core opens');

  const isDeclined = answer.choice === 'decline';

  const records = await readProposedRecords(deps, tx, [row]);

  const proposed = records.get(row.createdSequence);

  invariant(proposed, 'an action proposal has its record');

  const payload = actionProposedCodec.decode(proposed.payload);
  const rule = answer.choice === 'always_allow' ? findRule(proposed) : null;

  if (answer.choice === 'always_allow' && rule === null) {
    return { status: 'refused', refusal: { error: 'NOT_ALLOWED', reason: 'rule_gone' } };
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
    }),
    ...(isDeclined && answer.note !== undefined ? { erasable: { reason: answer.note } } : {}),
  });

  if (isDeclined) {
    return { status: 'done', result: { proposalID: row.id, state: 'declined' } };
  }

  if (rule === null) {
    return { status: 'done', result: { proposalID: row.id, state: 'approved' } };
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
