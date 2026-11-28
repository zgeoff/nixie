import type { ActionCall, ListedAction } from '@heynixie/actions';
import { handoverAskedFieldsSchema } from '@heynixie/connectors';
import type { LogRecord as ContractRecord, DefinitionNotice } from '@heynixie/contract';
import { spanSchema } from '@heynixie/contract';
import type { JSONObject, JSONValue, LogRecord, RecordKind } from '@heynixie/log';
import { momentKeptCodec, recordForgetStartedCodec, recordForgottenCodec } from '@heynixie/memory';
import {
  modelCompactedCodec,
  modelCompactionFailedCodec,
  modelReplyVoidedCodec,
  modelSessionSummarizedCodec,
  modelTurnEndedCodec,
} from '@heynixie/models';
import type { ReplyVoidReason } from '@heynixie/models';
import { memoryRecalledCodec } from '@heynixie/sessions';
import { skillsWriteAppliedCodec } from '@heynixie/skills';
import type { TaskProfile } from '@heynixie/tasks';
import {
  conversationTaskID,
  findLateBySeconds,
  getTaskName,
  ownerMessageCodec,
  parseTriggerFired,
  renderExchangeNotice,
  taskCreatedCodec,
  taskExchangeLimitedCodec,
  taskLeaseExpiredCodec,
  taskMessageCodec,
  taskRevivedCodec,
  taskStepCommittedCodec,
  taskStepErroredCodec,
  taskStepInterruptedCodec,
  taskStepStartedCodec,
} from '@heynixie/tasks';
import { toolCalledCodec, toolResultCodec } from '@heynixie/tools';
import { z } from 'zod';
import { forgetToolName } from '../proposal/read-forget-body-fields';
import { toPlaceActed } from './to-place-acted';
import { toPlaceNarrowed } from './to-place-narrowed';
import { toWorkerView } from './to-worker-view';

const messageKinds: ReadonlySet<RecordKind> = new Set(['owner_message', 'model.reply']);

export interface RecordLookups {
  readonly actions: ReadonlyMap<string, ActionCall>;
  readonly cancelledActionIDs: ReadonlySet<string>;

  // the notice of each definition.changed record, keyed by its record's sequence
  readonly definitionNotices: ReadonlyMap<number, DefinitionNotice>;

  // the key of the place that each places.acted record names, keyed by its record's sequence
  readonly placeActs: ReadonlyMap<number, string>;

  // the key of the place that each places.narrowed record names, or its short ID once a forget took
  // the key, keyed by its record's sequence
  readonly placeNarrowings: ReadonlyMap<number, string>;
  readonly proposals: ReadonlyMap<
    number,
    { readonly proposalID: string; readonly shortID: string }
  >;

  // the name and the note of each reminder fire, keyed by its record's sequence
  readonly reminders: ReadonlyMap<number, { readonly name: string | null; readonly note: string }>;
  readonly removedSequences: ReadonlySet<number>;
  readonly stopCancelledActions: ReadonlyMap<number, readonly ListedAction[]>;
  readonly taskDirectory: readonly TaskProfile[];

  // the reason of each reply that a void record names, keyed by the reply's sequence
  readonly voidedReplies: ReadonlyMap<number, ReplyVoidReason>;
}

const noLookups: RecordLookups = {
  actions: new Map(),
  cancelledActionIDs: new Set(),
  definitionNotices: new Map(),
  placeActs: new Map(),
  placeNarrowings: new Map(),
  proposals: new Map(),
  reminders: new Map(),
  removedSequences: new Set(),
  stopCancelledActions: new Map(),
  taskDirectory: [],
  voidedReplies: new Map(),
};

export function toContractRecord(
  record: LogRecord,
  lookups: RecordLookups = noLookups,
): ContractRecord | null {
  if (record.thread === null) {
    return null;
  }

  const message = messageKinds.has(record.kind) ? toMessage(record, lookups) : undefined;
  const task = toTask(record);
  const toolCall = toToolCall(record, lookups.cancelledActionIDs);
  const taskMessage = record.kind === 'task_message' ? toTaskMessage(record, lookups) : undefined;
  const stop = record.kind === 'task.stopped' ? toStop(record, lookups) : undefined;

  const exchangeNotice =
    record.kind === 'task.exchange_limited' ? toExchangeNotice(record, lookups) : undefined;

  const reminder = toReminder(record, lookups);
  const recall = record.kind === 'memory.recalled' ? toRecall(record) : undefined;
  const moment = record.kind === 'moment_kept' ? toKeptMoment(record) : undefined;

  const placeActed =
    record.kind === 'places.acted'
      ? toPlaceActed(record, lookups.placeActs.get(record.sequence))
      : undefined;

  const placeNarrowed =
    record.kind === 'places.narrowed'
      ? toPlaceNarrowed(record, lookups.placeNarrowings.get(record.sequence))
      : undefined;

  const proposal = lookups.proposals.get(record.sequence);
  const removal = record.kind === 'action.outcome' ? toRemoval(record, lookups) : undefined;
  const definitionNotice = lookups.definitionNotices.get(record.sequence);
  const skillNotice = record.kind === 'skills.write_applied' ? toSkillNotice(record) : undefined;
  const worker = toWorkerView(record);
  const handover = record.kind === 'computer.handover_asked' ? toHandover(record) : undefined;

  return {
    ...toSessionFields(record),
    ...toForget(record),
    ...toVoidedReply(record),
    ...toGap(record, lookups),
    ...(definitionNotice === undefined ? {} : { definitionNotice }),
    ...(exchangeNotice === undefined ? {} : { exchangeNotice }),
    ...(handover === undefined ? {} : { handover }),
    kind: record.kind,
    ...(message === undefined ? {} : { message }),
    ...(moment === undefined ? {} : { moment }),
    ...(placeActed === undefined ? {} : { placeActed }),
    ...(placeNarrowed === undefined ? {} : { placeNarrowed }),
    ...(proposal === undefined ? {} : { proposal }),
    ...(reminder === undefined ? {} : { reminder }),
    ...(recall === undefined ? {} : { recall }),
    recordedAt: record.recordedAt,
    ...(removal === undefined ? {} : { removal }),
    sequence: record.sequence,
    ...(skillNotice === undefined ? {} : { skillNotice }),
    ...(stop === undefined ? {} : { stop }),
    thread: record.thread,
    ...(task === undefined ? {} : { task }),
    ...(taskMessage === undefined ? {} : { taskMessage }),
    ...(toolCall === undefined ? {} : { toolCall }),
    ...(worker === undefined ? {} : { worker }),
  };
}

type Message = NonNullable<ContractRecord['message']>;

function toMessage(record: LogRecord, lookups: RecordLookups): Message | undefined {
  if (record.erasable.status !== 'readable') {
    return undefined;
  }

  const text = record.erasable.fields['text'];

  const owner =
    record.kind === 'owner_message' ? ownerMessageCodec.tryDecodePartial(record.payload) : null;

  if (typeof text !== 'string') {
    return undefined;
  }

  const spans = z.array(spanSchema).optional().parse(record.erasable.fields['spans']);

  const voidReason =
    record.kind === 'model.reply' ? lookups.voidedReplies.get(record.sequence) : undefined;

  return {
    ...(owner?.clientMessageId === undefined ? {} : { clientMessageId: owner.clientMessageId }),
    ...(owner?.images === undefined ? {} : { images: [...owner.images] }),
    ...(voidReason === undefined ? {} : { isVoided: true as const, voidReason }),
    ...(spans === undefined ? {} : { spans: [...spans] }),
    text,
  };
}

type Task = NonNullable<ContractRecord['task']>;

const taskCodecs = [
  taskCreatedCodec,
  taskRevivedCodec,
  taskStepStartedCodec,
  taskStepCommittedCodec,
  taskStepInterruptedCodec,
  taskStepErroredCodec,
  taskLeaseExpiredCodec,
];

interface TaskFields {
  readonly taskID?: string | undefined;
  readonly stepKey?: string | undefined;
  readonly readCursor?: number | undefined;
}

function toTask(record: LogRecord): Task | undefined {
  const codec = taskCodecs.find((candidate) => candidate.kind === record.kind);
  const fields: TaskFields | null | undefined = codec?.tryDecodePartial(record.payload);
  const stepKey = fields?.stepKey ?? record.stepKey;

  const error =
    record.kind === 'task.step_errored' && record.erasable.status === 'readable'
      ? record.erasable.fields['message']
      : undefined;

  if (fields?.taskID === undefined) {
    return undefined;
  }

  return {
    ...(typeof error === 'string' ? { error } : {}),
    ...(record.kind === 'task.step_errored' ? toRetry(record.payload) : {}),
    ...(fields.readCursor === undefined ? {} : { readCursor: fields.readCursor }),
    ...(stepKey === null ? {} : { stepKey }),
    taskID: fields.taskID,
  };
}

type TaskRetry = Pick<Task, 'errorLimit' | 'errors' | 'isWaitingForRetry' | 'reason' | 'retryAt'>;

function toRetry(payload: JSONObject): TaskRetry {
  const retry = taskStepErroredCodec.tryDecodePartial(payload);
  const isWaitingForRetry = retry?.nextState === 'waiting';

  return {
    ...(retry?.errorLimit === undefined ? {} : { errorLimit: retry.errorLimit }),
    ...(retry?.errors === undefined ? {} : { errors: retry.errors }),
    ...(isWaitingForRetry ? { isWaitingForRetry } : {}),
    ...(retry?.reason === undefined ? {} : { reason: retry.reason }),
    ...(retry?.claimableAt === undefined ? {} : { retryAt: new Date(retry.claimableAt) }),
  };
}

type ToolCall = NonNullable<ContractRecord['toolCall']>;

const toolCodecs = [toolCalledCodec, toolResultCodec];

interface ToolFields {
  readonly callID?: string | undefined;
  readonly runID?: string | undefined;
  readonly tool?: string | undefined;
  readonly outcome?: string | undefined;
  readonly actionID?: string | null | undefined;
}

function toToolCall(
  record: LogRecord,
  cancelledActionIDs: ReadonlySet<string>,
): ToolCall | undefined {
  const codec = toolCodecs.find((candidate) => candidate.kind === record.kind);
  const call: ToolFields | null | undefined = codec?.tryDecodePartial(record.payload);

  if (call?.callID === undefined) {
    return undefined;
  }

  const fields = record.erasable.status === 'readable' ? record.erasable.fields : undefined;
  const input = record.kind === 'tool_called' ? fields?.['input'] : undefined;
  const content = record.kind === 'tool_result' ? fields : undefined;

  // The tool result record keeps a stop's cancel under failed, so the release before can read it,
  // and the action's own row records the cancel.
  const isCancelled =
    call.outcome === 'failed' &&
    typeof call.actionID === 'string' &&
    cancelledActionIDs.has(call.actionID);

  const outcome = isCancelled ? 'cancelled' : call.outcome;

  return {
    callID: call.callID,
    ...(content === undefined ? {} : { content: { ...content } }),
    ...(isJSONObject(input) ? { input: { ...input } } : {}),
    ...(outcome === undefined ? {} : { outcome }),
    ...(call.runID === undefined ? {} : { runID: call.runID }),
    ...(call.tool === undefined ? {} : { tool: call.tool }),
  };
}

function isJSONObject(value: JSONValue | undefined): value is JSONObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

type TaskMessage = NonNullable<ContractRecord['taskMessage']>;

function toTaskMessage(record: LogRecord, lookups: RecordLookups): TaskMessage | undefined {
  const message = taskMessageCodec.tryDecodePartial(record.payload);
  const body = record.erasable.status === 'readable' ? record.erasable.fields['body'] : undefined;

  if (
    message?.messageID === undefined ||
    message.from === undefined ||
    message.to === undefined ||
    message.kind === undefined ||
    message.hop === undefined ||
    message.woke === undefined
  ) {
    return undefined;
  }

  return {
    from: message.from,
    fromName: getTaskName({ directory: lookups.taskDirectory }, message.from),
    hop: message.hop,
    kind: message.kind,
    messageID: message.messageID,
    ...(message.replyTo === undefined || message.replyTo === null
      ? {}
      : { replyTo: message.replyTo }),
    ...(typeof body === 'string' ? { text: body } : {}),
    to: message.to,
    woke: message.woke,
  };
}

type Stop = NonNullable<ContractRecord['stop']>;

function toStop(record: LogRecord, lookups: RecordLookups): Stop {
  const cancelled = lookups.stopCancelledActions.get(record.sequence) ?? [];

  return {
    cancelledActions: cancelled.map((action) => ({ actionID: action.actionID, tool: action.tool })),
  };
}

type ExchangeNotice = NonNullable<ContractRecord['exchangeNotice']>;

function toExchangeNotice(record: LogRecord, lookups: RecordLookups): ExchangeNotice | undefined {
  const notice = taskExchangeLimitedCodec.tryDecodePartial(record.payload);

  if (
    notice?.messageID === undefined ||
    notice.stepKey === undefined ||
    notice.from === undefined ||
    notice.to === undefined ||
    notice.hops === undefined ||
    notice.waiting === undefined
  ) {
    return undefined;
  }

  const rendered = renderExchangeNotice(
    { directory: lookups.taskDirectory },
    {
      messageID: notice.messageID,
      stepKey: notice.stepKey,
      from: notice.from,
      to: notice.to,
      hops: notice.hops,
      waiting: notice.waiting,
    },
  );

  return {
    link: { label: rendered.link.label, messageID: rendered.link.messageID, taskID: notice.to },
    text: rendered.text,
  };
}

type Reminder = NonNullable<ContractRecord['reminder']>;

// A schedule or at fire on the conversation's thread shows as a reminder. A fire on a task's thread
// and a poll fire show as no reminder.
function toReminder(record: LogRecord, lookups: RecordLookups): Reminder | undefined {
  if (record.kind !== 'trigger.fired' || record.thread !== conversationTaskID) {
    return undefined;
  }

  const fire = parseTriggerFired(record.payload);
  const text = lookups.reminders.get(record.sequence);

  if (fire === null || fire.kind === 'poll' || text === undefined) {
    return undefined;
  }

  return {
    name: text.name,
    note: text.note,
    scheduledFor: new Date(fire.scheduledFor).toISOString(),
    lateBySeconds: findLateBySeconds(fire),
  };
}

type Recall = NonNullable<ContractRecord['recall']>;

function toRecall(record: LogRecord): Recall {
  const items = memoryRecalledCodec.tryDecodePartial(record.payload)?.items ?? [];

  return { items: items.map((item) => toRecallItem(item)) };
}

type RecallItem = Recall['items'][number];

function toRecallItem(item: RecallItem & { readonly similarity?: number }): RecallItem {
  return item.score === undefined
    ? { itemID: item.itemID, version: item.version }
    : { itemID: item.itemID, version: item.version, score: item.score };
}

type KeptMoment = NonNullable<ContractRecord['moment']>;

function toKeptMoment(record: LogRecord): KeptMoment | undefined {
  const kept = momentKeptCodec.tryDecodePartial(record.payload);
  const title = record.erasable.status === 'readable' ? record.erasable.fields['title'] : undefined;

  if (kept?.momentID === undefined || kept.shortID === undefined) {
    return undefined;
  }

  return {
    momentID: kept.momentID,
    shortID: kept.shortID,
    ...(typeof title === 'string' ? { title } : {}),
  };
}

const removalOutcome = z.object({ actionID: z.string(), status: z.literal('done') });
const removalResult = z.object({ removed: z.string().regex(/^\d+$/u), kind: z.string() });

type Removal = NonNullable<ContractRecord['removal']>;

// The outcome of a removal that finished names the record, and never holds its text. It also names
// the call that asked for the removal, which sits in the turn the owner approved it for. An outcome
// whose result a forget erased names nothing.
function toRemoval(record: LogRecord, lookups: RecordLookups): Removal | undefined {
  const outcome = removalOutcome.safeParse(record.payload);
  const action = outcome.success ? lookups.actions.get(outcome.data.actionID) : undefined;

  if (
    !outcome.success ||
    record.erasable.status !== 'readable' ||
    action?.tool !== forgetToolName
  ) {
    return undefined;
  }

  const result = removalResult.safeParse(record.erasable.fields['result']);

  return result.success
    ? {
        kind: result.data.kind,
        sequence: Number(result.data.removed),
        ...(action.callSequence === null ? {} : { callSequence: action.callSequence }),
      }
    : undefined;
}

type SkillNotice = NonNullable<ContractRecord['skillNotice']>;

function toSkillNotice(record: LogRecord): SkillNotice | undefined {
  const applied = skillsWriteAppliedCodec.tryDecodePartial(record.payload);

  if (
    applied?.name === undefined ||
    applied.skillHash === undefined ||
    applied.baseHash === undefined ||
    applied.rule?.id === undefined
  ) {
    return undefined;
  }

  return {
    name: applied.name,
    skillHash: applied.skillHash,
    isNew: applied.baseHash === null,
    ruleID: applied.rule.id,
  };
}

type Handover = NonNullable<ContractRecord['handover']>;

// the reason of an ask, while it is readable
function toHandover(record: LogRecord): Handover {
  const fields =
    record.erasable.status === 'readable'
      ? handoverAskedFieldsSchema.safeParse(record.erasable.fields)
      : null;

  return fields?.success === true ? { reason: fields.data.reason } : {};
}

type SessionFields = Pick<
  ContractRecord,
  'compaction' | 'compactionFailure' | 'context' | 'isSilentTurn' | 'summary'
>;

function toSessionFields(record: LogRecord): SessionFields {
  const turn =
    record.kind === 'model.turn_ended'
      ? modelTurnEndedCodec.tryDecodePartial(record.payload)
      : undefined;

  const context = turn === undefined ? undefined : toContext(turn);
  const compaction = record.kind === 'model.compacted' ? toCompaction(record) : undefined;
  const summary = record.kind === 'model.session_summarized' ? toSummary(record) : undefined;

  const compactionFailure =
    record.kind === 'model.compaction_failed' ? toCompactionFailure(record) : undefined;

  return {
    ...(compaction === undefined ? {} : { compaction }),
    ...(compactionFailure === undefined ? {} : { compactionFailure }),
    ...(context === undefined ? {} : { context }),
    ...(turn?.isSilent === true ? { isSilentTurn: true } : {}),
    ...(summary === undefined ? {} : { summary }),
  };
}

type Context = NonNullable<ContractRecord['context']>;

type TurnEnd = ReturnType<typeof modelTurnEndedCodec.tryDecodePartial>;

function toContext(turn: TurnEnd): Context | undefined {
  return turn?.contextSize === undefined || turn.contextWindow === undefined
    ? undefined
    : { size: turn.contextSize, window: turn.contextWindow };
}

type Compaction = NonNullable<ContractRecord['compaction']>;

function toCompaction(record: LogRecord): Compaction | undefined {
  const compacted = modelCompactedCodec.tryDecodePartial(record.payload);

  if (compacted?.trigger === undefined || compacted.preTokens === undefined) {
    return undefined;
  }

  const postTokens = compacted.postTokens ?? null;

  return {
    ...(postTokens === null ? {} : { postTokens }),
    preTokens: compacted.preTokens,
    trigger: compacted.trigger,
  };
}

type Summary = NonNullable<ContractRecord['summary']>;

function toSummary(record: LogRecord): Summary | undefined {
  const summary = modelSessionSummarizedCodec.tryDecodePartial(record.payload);
  const text = record.erasable.status === 'readable' ? record.erasable.fields['text'] : undefined;

  if (summary?.trigger === undefined || summary.summaryTokens === undefined) {
    return undefined;
  }

  return {
    ...(summary.contextSize === undefined ? {} : { contextSize: summary.contextSize }),
    summaryTokens: summary.summaryTokens,
    ...(typeof text === 'string' ? { text } : {}),
    trigger: summary.trigger,
  };
}

type CompactionFailure = NonNullable<ContractRecord['compactionFailure']>;

function toCompactionFailure(record: LogRecord): CompactionFailure | undefined {
  const failures = modelCompactionFailedCodec.tryDecodePartial(record.payload)?.failures;

  return failures === undefined ? undefined : { failures };
}

const forgetCodecs = [recordForgetStartedCodec, recordForgottenCodec];

function toForget(record: LogRecord): Pick<ContractRecord, 'forget'> {
  const codec = forgetCodecs.find((candidate) => candidate.kind === record.kind);
  const sequence = codec?.tryDecodePartial(record.payload)?.recordSequence;

  return sequence === undefined ? {} : { forget: { sequence } };
}

function toVoidedReply(record: LogRecord): Pick<ContractRecord, 'voidedReply'> {
  const voided =
    record.kind === modelReplyVoidedCodec.kind
      ? modelReplyVoidedCodec.tryDecodePartial(record.payload)
      : null;

  return voided?.replySequence === undefined || voided.reason === undefined
    ? {}
    : { voidedReply: { sequence: voided.replySequence, reason: voided.reason } };
}

function toGap(record: LogRecord, lookups: RecordLookups): Pick<ContractRecord, 'isRemoved'> {
  const isRemoved =
    record.erasable.status === 'shredded' && lookups.removedSequences.has(record.sequence);

  return isRemoved ? { isRemoved: true } : {};
}
