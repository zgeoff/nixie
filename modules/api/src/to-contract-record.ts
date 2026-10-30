import type { ListedAction } from '@heynixie/actions';
import type { LogRecord as ContractRecord } from '@heynixie/contract';
import { spanSchema } from '@heynixie/contract';
import type { JSONObject, JSONValue, LogRecord, RecordKind } from '@heynixie/log';
import {
  memoryRatedCodec,
  momentKeptCodec,
  recordForgetStartedCodec,
  recordForgottenCodec,
} from '@heynixie/memory';
import {
  modelCompactedCodec,
  modelCompactionFailedCodec,
  modelSessionSummarizedCodec,
  modelTurnEndedCodec,
} from '@heynixie/models';
import { memoryRecalledCodec } from '@heynixie/sessions';
import type { TaskProfile } from '@heynixie/tasks';
import {
  getTaskName,
  ownerMessageCodec,
  renderExchangeNotice,
  taskCreatedCodec,
  taskExchangeLimitedCodec,
  taskLeaseExpiredCodec,
  taskMessageCodec,
  taskRevivedCodec,
  taskRouteCorrectedCodec,
  taskRoutedCodec,
  taskStepCommittedCodec,
  taskStepErroredCodec,
  taskStepInterruptedCodec,
  taskStepStartedCodec,
} from '@heynixie/tasks';
import { toolCalledCodec, toolResultCodec } from '@heynixie/tools';
import { z } from 'zod';

const messageKinds: ReadonlySet<RecordKind> = new Set(['owner_message', 'model.reply']);

export interface RecordLookups {
  readonly cancelledActionIDs: ReadonlySet<string>;
  readonly stopCancelledActions: ReadonlyMap<number, readonly ListedAction[]>;
  readonly taskDirectory: readonly TaskProfile[];
}

const noLookups: RecordLookups = {
  cancelledActionIDs: new Set(),
  stopCancelledActions: new Map(),
  taskDirectory: [],
};

export function toContractRecord(
  record: LogRecord,
  lookups: RecordLookups = noLookups,
): ContractRecord | null {
  if (record.thread === null) {
    return null;
  }

  const message = messageKinds.has(record.kind) ? toMessage(record) : undefined;
  const task = toTask(record);
  const toolCall = toToolCall(record, lookups.cancelledActionIDs);
  const taskMessage = record.kind === 'task_message' ? toTaskMessage(record, lookups) : undefined;
  const stop = record.kind === 'task.stopped' ? toStop(record, lookups) : undefined;

  const exchangeNotice =
    record.kind === 'task.exchange_limited' ? toExchangeNotice(record, lookups) : undefined;

  const recall = record.kind === 'memory.recalled' ? toRecall(record) : undefined;
  const rating = record.kind === 'memory.rated' ? toRating(record) : undefined;
  const moment = record.kind === 'moment_kept' ? toKeptMoment(record) : undefined;
  const route = toRoute(record);

  return {
    ...toSessionFields(record),
    ...toForget(record),
    ...(exchangeNotice === undefined ? {} : { exchangeNotice }),
    kind: record.kind,
    ...(message === undefined ? {} : { message }),
    ...(moment === undefined ? {} : { moment }),
    ...(rating === undefined ? {} : { rating }),
    ...(recall === undefined ? {} : { recall }),
    recordedAt: record.recordedAt,
    ...(route === undefined ? {} : { route }),
    sequence: record.sequence,
    ...(stop === undefined ? {} : { stop }),
    thread: record.thread,
    ...(task === undefined ? {} : { task }),
    ...(taskMessage === undefined ? {} : { taskMessage }),
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

function toRetry(payload: JSONObject): Pick<Task, 'errorLimit' | 'errors' | 'retryAt'> {
  const retry = taskStepErroredCodec.tryDecodePartial(payload);

  return {
    ...(retry?.errorLimit === undefined ? {} : { errorLimit: retry.errorLimit }),
    ...(retry?.errors === undefined ? {} : { errors: retry.errors }),
    ...(retry?.claimableAt === undefined ? {} : { retryAt: new Date(retry.claimableAt) }),
  };
}

type ToolCall = NonNullable<ContractRecord['toolCall']>;

const toolCodecs = [toolCalledCodec, toolResultCodec];

interface ToolFields {
  readonly callID?: string | undefined;
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

type Rating = NonNullable<ContractRecord['rating']>;

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

type Route = NonNullable<ContractRecord['route']>;

function toRoute(record: LogRecord): Route | undefined {
  if (record.kind === 'task.routed') {
    const routed = taskRoutedCodec.tryDecodePartial(record.payload);

    return routed?.taskID === undefined || routed.messages === undefined
      ? undefined
      : { isMove: false, messages: [...routed.messages], taskID: routed.taskID };
  }

  if (record.kind === 'task.route_corrected') {
    const corrected = taskRouteCorrectedCodec.tryDecodePartial(record.payload);

    return corrected?.to === undefined || corrected.message === undefined
      ? undefined
      : { isMove: true, messages: [corrected.message], taskID: corrected.to };
  }

  return undefined;
}

type SessionFields = Pick<
  ContractRecord,
  'compaction' | 'compactionFailure' | 'context' | 'summary'
>;

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

function toContext(record: LogRecord): Context | undefined {
  const turn = modelTurnEndedCodec.tryDecodePartial(record.payload);

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
