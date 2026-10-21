import type { LogRecord as ContractRecord } from '@heynixie/contract';
import { spanSchema } from '@heynixie/contract';
import type { JSONObject, JSONValue, LogRecord, RecordKind } from '@heynixie/log';
import { memoryRatedCodec, recordForgetStartedCodec, recordForgottenCodec } from '@heynixie/memory';
import {
  modelCompactedCodec,
  modelCompactionFailedCodec,
  modelSessionSummarizedCodec,
  modelTurnEndedCodec,
} from '@heynixie/models';
import { memoryRecalledCodec } from '@heynixie/sessions';
import {
  ownerMessageCodec,
  taskCreatedCodec,
  taskLeaseExpiredCodec,
  taskRevivedCodec,
  taskStepCommittedCodec,
  taskStepErroredCodec,
  taskStepInterruptedCodec,
  taskStepStartedCodec,
} from '@heynixie/tasks';
import { toolCalledCodec, toolResultCodec } from '@heynixie/tools';
import { z } from 'zod';

// your message, and a reply from the conversation's model
const messageKinds: ReadonlySet<RecordKind> = new Set(['owner_message', 'model.reply']);

// Turns a log record into the record a client renders, or null for one in no thread, which no
// client view shows. A forgotten message or reply keeps its place with no text, and a payload that
// does not fit its kind's codec gives none of its fields.
export function toContractRecord(record: LogRecord): ContractRecord | null {
  if (record.thread === null) {
    return null;
  }

  const message = messageKinds.has(record.kind) ? toMessage(record) : undefined;
  const task = toTask(record);
  const toolCall = toToolCall(record);
  const recall = record.kind === 'memory.recalled' ? toRecall(record) : undefined;
  const rating = record.kind === 'memory.rated' ? toRating(record) : undefined;

  return {
    ...toSessionFields(record),
    ...toForget(record),
    kind: record.kind,
    ...(message === undefined ? {} : { message }),
    ...(rating === undefined ? {} : { rating }),
    ...(recall === undefined ? {} : { recall }),
    recordedAt: record.recordedAt,
    sequence: record.sequence,
    thread: record.thread,
    ...(task === undefined ? {} : { task }),
    ...(toolCall === undefined ? {} : { toolCall }),
  };
}

type Message = NonNullable<ContractRecord['message']>;

function toMessage(record: LogRecord): Message | undefined {
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

  return {
    ...(owner?.clientMessageId === undefined ? {} : { clientMessageId: owner.clientMessageId }),
    ...(owner?.images === undefined ? {} : { images: [...owner.images] }),
    ...(spans === undefined ? {} : { spans: [...spans] }),
    text,
  };
}

type Task = NonNullable<ContractRecord['task']>;

// the task records that name their task, which a wake does not
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
}

// A step's start names its step in the payload, and its commit in the record's own step key. A
// failed step's record holds the error's message as its one erasable field, and a forgotten one
// keeps its task, step and retry with no error.
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
    ...(stepKey === null ? {} : { stepKey }),
    taskID: fields.taskID,
  };
}

// A failed step's errors in a row, the limit in force, which a record from before the limit was
// recorded lacks, and the time its task tries again.
function toRetry(payload: JSONObject): Pick<Task, 'errorLimit' | 'errors' | 'retryAt'> {
  const retry = taskStepErroredCodec.tryDecodePartial(payload);

  return {
    ...(retry?.errorLimit === undefined ? {} : { errorLimit: retry.errorLimit }),
    ...(retry?.errors === undefined ? {} : { errors: retry.errors }),
    ...(retry?.claimableAt === undefined ? {} : { retryAt: new Date(retry.claimableAt) }),
  };
}

type ToolCall = NonNullable<ContractRecord['toolCall']>;

// a tool call, and the result that answers it
const toolCodecs = [toolCalledCodec, toolResultCodec];

interface ToolFields {
  readonly callID?: string | undefined;
  readonly tool?: string | undefined;
  readonly outcome?: string | undefined;
}

// The call's record holds its input as its one erasable field, and the result's record holds the
// content the tool returned. A forgotten call keeps its tool and outcome with no content.
function toToolCall(record: LogRecord): ToolCall | undefined {
  const codec = toolCodecs.find((candidate) => candidate.kind === record.kind);
  const call: ToolFields | null | undefined = codec?.tryDecodePartial(record.payload);

  if (call?.callID === undefined) {
    return undefined;
  }

  const fields = record.erasable.status === 'readable' ? record.erasable.fields : undefined;
  const input = record.kind === 'tool_called' ? fields?.['input'] : undefined;
  const content = record.kind === 'tool_result' ? fields : undefined;

  return {
    callID: call.callID,
    ...(content === undefined ? {} : { content: { ...content } }),
    ...(isJSONObject(input) ? { input: { ...input } } : {}),
    ...(call.outcome === undefined ? {} : { outcome: call.outcome }),
    ...(call.tool === undefined ? {} : { tool: call.tool }),
  };
}

function isJSONObject(value: JSONValue | undefined): value is JSONObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

type Recall = NonNullable<ContractRecord['recall']>;

// A recall's record lists the versions it delivered, each with its match score when a query ranked
// it, and holds no text.
function toRecall(record: LogRecord): Recall {
  const items = memoryRecalledCodec.tryDecodePartial(record.payload)?.items ?? [];

  return { items: items.map((item) => toRecallItem(item)) };
}

type RecallItem = Recall['items'][number];

// the delivered version and its match score, never the similarity a client does not show
function toRecallItem(item: RecallItem & { readonly similarity?: number }): RecallItem {
  return item.score === undefined
    ? { itemID: item.itemID, version: item.version }
    : { itemID: item.itemID, version: item.version, score: item.score };
}

type Rating = NonNullable<ContractRecord['rating']>;

// A rating's record names the recall it rates and each item's verdict, and holds each note sealed,
// which memory.readRatingNotes opens. A record that names no recall gives no rating.
function toRating(record: LogRecord): Rating | undefined {
  const rated = memoryRatedCodec.tryDecodePartial(record.payload);

  if (rated?.recalledSequence === undefined) {
    return undefined;
  }

  return {
    items: (rated.ratings ?? []).map((item) => ({
      hasNote: item.sealedNote !== undefined,
      itemID: item.itemID,
      verdict: item.verdict,
      version: item.version,
    })),
    ...(rated.ratedBy === undefined ? {} : { ratedBy: rated.ratedBy }),
    recalledSequence: rated.recalledSequence,
  };
}

type SessionFields = Pick<
  ContractRecord,
  'compaction' | 'compactionFailure' | 'context' | 'summary'
>;

// What the conversation's session records carry: a turn end's context, a compaction of the SDK's,
// and nixie's summary or a failed compaction in its place.
function toSessionFields(record: LogRecord): SessionFields {
  const context = record.kind === 'model.turn_ended' ? toContext(record) : undefined;
  const compaction = record.kind === 'model.compacted' ? toCompaction(record) : undefined;
  const summary = record.kind === 'model.session_summarized' ? toSummary(record) : undefined;

  const compactionFailure =
    record.kind === 'model.compaction_failed' ? toCompactionFailure(record) : undefined;

  return {
    ...(compaction === undefined ? {} : { compaction }),
    ...(compactionFailure === undefined ? {} : { compactionFailure }),
    ...(context === undefined ? {} : { context }),
    ...(summary === undefined ? {} : { summary }),
  };
}

type Context = NonNullable<ContractRecord['context']>;

// A turn end names the context its last model call read and the window it compacts within; one
// from before nixie recorded them has neither.
function toContext(record: LogRecord): Context | undefined {
  const turn = modelTurnEndedCodec.tryDecodePartial(record.payload);

  return turn?.contextSize === undefined || turn.contextWindow === undefined
    ? undefined
    : { size: turn.contextSize, window: turn.contextWindow };
}

type Compaction = NonNullable<ContractRecord['compaction']>;

// A compaction's record holds its trigger and its token counts, and a null after count when the
// session reported none.
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

// A summary's record holds what asked for it and its sizes, and its text while its key exists. A
// summary a forget erased keeps its place with no text.
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

// A failed compaction's record counts the failures in a row; its error stays out of the client.
function toCompactionFailure(record: LogRecord): CompactionFailure | undefined {
  const failures = modelCompactionFailedCodec.tryDecodePartial(record.payload)?.failures;

  return failures === undefined ? undefined : { failures };
}

// the start and the end of a forget of your message or a reply
const forgetCodecs = [recordForgetStartedCodec, recordForgottenCodec];

function toForget(record: LogRecord): Pick<ContractRecord, 'forget'> {
  const codec = forgetCodecs.find((candidate) => candidate.kind === record.kind);
  const sequence = codec?.tryDecodePartial(record.payload)?.recordSequence;

  return sequence === undefined ? {} : { forget: { sequence } };
}
