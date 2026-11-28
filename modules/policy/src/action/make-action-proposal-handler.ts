import type {
  Definitions,
  JSONObject,
  Log,
  LogRecord,
  LogTables,
  RecordInput,
} from '@heynixie/log';
import { readRecords } from '@heynixie/log';
import type {
  ApplyOutcome,
  ApplyRun,
  ProposalAnswerInput,
  ProposalBody,
  ProposalHashes,
  ProposalKindHandler,
  SharedProposal,
} from '@heynixie/proposals';
import { buildDiscardedOutcome } from '@heynixie/proposals';
import type { Transaction } from 'kysely';
import { sql } from 'kysely';
import invariant from 'tiny-invariant';
import { z } from 'zod';
import { buildCardPlaceOffer } from '../place/build-card-place-offer';
import { parseProposedPlaces } from '../place/parse-proposed-places';
import type { PlaceContext } from '../place/place-context';
import { ruleBodySchema } from '../rule/rule-body-schema';
import type { Rule } from '../types';
import { actionAnsweredCodec } from './action-answered-codec';
import { actionProposedCodec } from './action-proposed-codec';
import { buildActionProposalSentence } from './build-action-proposal-sentence';
import { findErasable, toJSONObject } from './find-erasable';
import { checkApproval, queueAction } from './queue-action';
import { writeApprovalTrusts } from './write-approval-trusts';

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
  readonly effects: readonly string[];
  readonly actionHash: string;
  readonly arguments: JSONObject;
  readonly callSequence: number;
  readonly riskClass: SharedProposal['riskClass'];
  readonly deadlineAt: number | null;

  // true for a tool that runs inside the turn, which the task's step runs after the approval
  readonly runsInStep: boolean;
}

export interface HeldActionRequest {
  readonly actionID: string;
  readonly proposalID: string;
}

// The action that a reopened ask holds, as its own queue stored it.
export interface HeldActionFacts {
  readonly actionHash: string;

  // null once a forget has shredded them
  readonly arguments: JSONObject | null;
}

export interface BodyFieldsRequest {
  readonly tool: string;
  readonly thread: string | null;
  readonly input: JSONObject;

  // the sequence of the call's own record, which holds anything the tool stored with the call
  readonly callSequence: number;
}

// Card fields that a tool's own records supply when the card's body is read, never stored with the
// proposal. A tool with none answers none, and a tool whose fields cannot be read answers
// unreadable, which leaves the card without a body.
export type BodyFields =
  | { readonly status: 'none' }
  | {
      readonly status: 'fields';
      readonly fields: Readonly<Record<string, string>>;

      // replaces the card's sentence, for a tool that says in its own words what the call does
      readonly sentence?: string;

      // replaces the card's approve button, such as 'Send reply'
      readonly approveLabel?: string;

      // the IDs of stored images the card shows beside its fields
      readonly images?: string[];

      // the desktop picture and click point of a screen click, which the card marks
      readonly screen?: { readonly x: number; readonly y: number; readonly picture: string };

      // the package that a package install adds
      readonly package?: ProposalBody['package'];
    }
  | { readonly status: 'unreadable' };

export interface ActionHandlerDeps {
  readonly log: Log;
  readonly definitions: () => Definitions;

  // Reads the extra card fields of a call, from the db the body is read on. Absent, no tool has any.
  readonly readBodyFields?: (
    db: Parameters<ProposalKindHandler['readBodies']>[0],
    request: BodyFieldsRequest,
  ) => Promise<BodyFields>;

  // Writes a record on the proposal's thread. A task that is still open takes it as an inbox record.
  readonly writeThreadRecord: (tx: Transaction<unknown>, input: RecordInput) => Promise<void>;

  // The directory an approval writes to, for a trust answer and for an approved places.propose.
  // Absent, such an answer is refused.
  readonly readPlaces?: () => PlaceContext | null;

  // Adds the rule as a runtime change in the caller's transaction.
  readonly writeRule: (tx: Transaction<unknown>, change: AlwaysAllowChange) => Promise<void>;

  // Queues the approved action in the answer's transaction, or releases the action that the row
  // held, and returns the action's ID.
  readonly queueApproved: (
    tx: Transaction<unknown>,
    approved: ApprovedActionFacts,
  ) => Promise<string>;

  // Reads the action that the row holds, with the hash it is queued under and the arguments it
  // stores. Null when no action waits behind the row.
  readonly readHeldAction: (
    tx: Transaction<unknown>,
    request: HeldActionRequest,
  ) => Promise<HeldActionFacts | null>;

  // Fails the action that a declined or lapsed row held, in the same transaction.
  readonly failHeld: (
    tx: Transaction<unknown>,
    row: SharedProposal,
    reason: 'declined' | 'lapsed' | 'withdrawn',
  ) => Promise<void>;

  // runs after the answer commits, so a rule takes effect at once
  readonly runAfterRule: () => Promise<unknown>;

  // Runs in the answer's transaction for a Decline of a no_rule ask, which ends the habit that the
  // group's open proposed rule rests on.
  readonly writeSuggestedRuleDecline: (
    tx: Transaction<unknown>,
    groupHash: string,
  ) => Promise<void>;

  // Runs after the commit of an Approve or Decline of a no_rule ask, to check the group.
  readonly runSuggestedRuleCheck: (groupHash: string) => Promise<void>;
}

const dayMs = 24 * 60 * 60 * 1000;

export function makeActionProposalHandler(deps: ActionHandlerDeps): ProposalKindHandler {
  return {
    family: 'action',
    lapseIntervalMs: (config) => config.lapseDays.action * dayMs,
    ownsTransaction: false,
    readBodies: async (db, rows) => {
      const records = await readProposedRecords(deps, db, rows);

      const bodies = await Promise.all(
        rows.map(async (row) => [row.id, await readBody(deps, db, row, records)] as const),
      );

      return new Map(bodies);
    },

    // reads only the proposal's own record: a tool's extra card fields read on another connection
    readSentence: (tx, row) => readSentence(deps, tx, row),
    readHashes: (db, row) => readHashes(deps, db, row),
    approve: (run, row, answer) => writeAnswer(deps, run, row, answer),
    discard: async (run, row, outcome, answer) => {
      if (outcome === 'declined' && answer !== null) {
        return writeAnswer(deps, run, row, answer);
      }

      invariant(run.tx, 'a held action fails in the transaction that the core opens');

      await deps.failHeld(run.tx, row, outcome);

      return buildDiscardedOutcome(row, outcome);
    },
  };
}

const bodyIDSchema = z.object({ proposalID: z.string() });

// The record that holds each row's body, keyed by the row's created sequence. The body record
// follows the one that created the row, and names the row's ID.
async function readProposedRecords(
  deps: ActionHandlerDeps,
  db: Parameters<ProposalKindHandler['readBodies']>[0],
  rows: readonly SharedProposal[],
): Promise<ReadonlyMap<number, LogRecord>> {
  if (rows.length === 0) {
    return new Map();
  }

  const found = await db
    .$extendTables<LogTables>()
    .selectFrom('records')
    .select(['sequence', 'payload'])
    .where('kind', '=', actionProposedCodec.kind)
    .where(
      sql`json_extract(payload, '$.proposalID')`,
      'in',
      rows.map((row) => row.id),
    )
    .execute();

  const read = await readRecords(
    { ...deps.log, writer: { ...deps.log.writer, db } },
    { afterSequence: 0, sequences: found.map((entry) => entry.sequence), limit: found.length },
  );

  const bySequence = new Map(read.map((entry) => [entry.record.sequence, entry.record]));

  const sequenceByID = new Map(
    found.map((entry) => [
      bodyIDSchema.parse(JSON.parse(entry.payload)).proposalID,
      entry.sequence,
    ]),
  );

  return new Map(
    rows.flatMap((row) => {
      const sequence = sequenceByID.get(row.id);
      const record = sequence === undefined ? undefined : bySequence.get(sequence);

      return record === undefined ? [] : [[row.createdSequence, record] as const];
    }),
  );
}

async function readBody(
  deps: ActionHandlerDeps,
  db: Parameters<ProposalKindHandler['readBodies']>[0],
  row: SharedProposal,
  records: ReadonlyMap<number, LogRecord>,
): Promise<ProposalBody | null> {
  const record = records.get(row.createdSequence);
  const erasable = record === undefined ? null : findErasable(record);

  // A forget shreds the arguments and destinations, and a card without them shows another action.
  if (record === undefined || erasable === null) {
    return null;
  }

  const payload = actionProposedCodec.decode(record.payload);

  const read = await deps.readBodyFields?.(db, {
    tool: payload.tool,
    thread: row.thread,
    input: toJSONObject(erasable.input),
    callSequence: payload.callSequence,
  });

  const extra = read ?? { status: 'none' };

  return extra.status === 'unreadable' ? null : toBody(payload, erasable, extra);
}

function toBody(
  payload: ReturnType<typeof actionProposedCodec.decode>,
  erasable: NonNullable<ReturnType<typeof findErasable>>,
  extra: Exclude<BodyFields, { readonly status: 'unreadable' }>,
): ProposalBody {
  const destinations = erasable.destinations.map((destination) => destination.value);
  const own = extra.status === 'fields' ? extra.sentence : undefined;
  const sentence = own ?? buildActionProposalSentence(payload.tool, payload.effects, destinations);
  const offer = buildCardPlaceOffer(payload.cause, destinations);
  const proposed = payload.tool === 'places.propose' ? parseProposedPlaces(erasable.input) : null;

  return {
    ...(offer === null
      ? {}
      : { place: { words: offer.words, readHash: offer.readHash, actHash: offer.actHash } }),
    ...(proposed?.status === 'ok'
      ? {
          places: proposed.places.map((place) => ({
            words: place.words,
            trust: place.trust,
            why: place.why,
          })),
        }
      : {}),
    sentence:
      payload.budgetReached === undefined
        ? sentence
        : `${sentence} ${capitalize(payload.budgetReached)}`,
    fields: {
      ...Object.fromEntries(
        Object.entries(erasable.input).map(([name, value]) => [name, toFieldText(value)]),
      ),
      ...(extra.status === 'fields' ? extra.fields : {}),
    },
    ruleSentence: erasable.ruleSentence ?? null,
    ...(payload.conditionErrors === undefined || payload.conditionErrors.length === 0
      ? {}
      : { conditionErrors: payload.conditionErrors.map((error) => ({ ...error })) }),
    ...(extra.status === 'fields' && extra.images !== undefined ? { images: extra.images } : {}),
    ...(extra.status === 'fields' && extra.screen !== undefined ? { screen: extra.screen } : {}),
    ...(extra.status === 'fields' && extra.package !== undefined ? { package: extra.package } : {}),
    approveLabel:
      (extra.status === 'fields' ? extra.approveLabel : undefined) ??
      buildActionApproveLabel(payload.tool, destinations[0]),
  };
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function toFieldText(value: unknown): string {
  return typeof value === 'string' ? value : JSON.stringify(value);
}

function buildActionApproveLabel(tool: string, destination: string | undefined): string {
  return destination === undefined ? `Run ${tool}` : `Run ${tool} to ${destination}`;
}

async function readSentence(
  deps: ActionHandlerDeps,
  db: Parameters<ProposalKindHandler['readBodies']>[0],
  row: SharedProposal,
): Promise<string | null> {
  const records = await readProposedRecords(deps, db, [row]);

  const record = records.get(row.createdSequence);
  const erasable = record === undefined ? null : findErasable(record);

  if (record === undefined || erasable === null) {
    return null;
  }

  const payload = actionProposedCodec.decode(record.payload);
  const destinations = erasable.destinations.map((destination) => destination.value);

  return buildActionProposalSentence(payload.tool, payload.effects, destinations);
}

async function readHashes(
  deps: ActionHandlerDeps,
  db: Parameters<ProposalKindHandler['readBodies']>[0],
  row: SharedProposal,
): Promise<ProposalHashes> {
  const records = await readProposedRecords(deps, db, [row]);

  const record = records.get(row.createdSequence);
  const erasable = record === undefined ? null : findErasable(record);

  const offer =
    record === undefined || erasable === null
      ? null
      : buildCardPlaceOffer(
          actionProposedCodec.decode(record.payload).cause,
          erasable.destinations.map((destination) => destination.value),
        );

  return {
    action: row.actionHash,
    rule: row.ruleHash,
    place: offer === null ? null : { read: offer.readHash, act: offer.actHash },
  };
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

  const request = { row, proposed, payload };
  const approvalRefusal = isDeclined ? null : await checkApproval(deps, tx, request);

  if (approvalRefusal !== null) {
    return { status: 'refused', refusal: approvalRefusal };
  }

  const trusted = findErasable(proposed);

  const placeRefusal =
    isDeclined || trusted === null
      ? null
      : await writeApprovalTrusts(
          deps.readPlaces,
          tx,
          {
            cause: payload.cause,
            tool: payload.tool,
            input: toJSONObject(trusted.input),
            destinations: trusted.destinations.map((destination) => destination.value),
          },
          answer,
        );

  if (placeRefusal !== null) {
    return { status: 'refused', refusal: placeRefusal };
  }

  const queued = isDeclined ? null : await queueAction(deps, tx, request);

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
      ...(answer.trust === undefined ? {} : { trust: answer.trust }),
      ...(groupHash === undefined ? {} : { groupHash }),
      ...(queued === null ? {} : { actionID: queued.actionID }),
    }),
    ...(isDeclined && answer.note !== undefined ? { erasable: { reason: answer.note } } : {}),
  });

  if (isDeclined && groupHash !== undefined) {
    await deps.writeSuggestedRuleDecline(tx, groupHash);
  }

  const afterSuggestedRule = async (): Promise<void> => {
    if (groupHash !== undefined) {
      await deps.runSuggestedRuleCheck(groupHash);
    }
  };

  if (isDeclined) {
    return {
      status: 'done',
      result: { proposalID: row.id, state: 'declined' },
      usedBy: null,
      detail: null,
      otherStakes: [],
      afterCommit: afterSuggestedRule,
    };
  }

  if (rule === null) {
    return {
      status: 'done',
      result: { proposalID: row.id, state: 'approved' },
      usedBy: queued?.actionID ?? null,
      detail: null,
      otherStakes: [],
      afterCommit: afterSuggestedRule,
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
    usedBy: queued?.actionID ?? null,
    detail: null,
    otherStakes: [],
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
