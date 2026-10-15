import type { LogRecord as ContractRecord, Span } from '@heynixie/contract';
import type { JSONObject, JSONValue, LogRecord } from '@heynixie/log';

// Turns a log record into the record a client renders, or null for a record that belongs to no
// thread, such as a session or a refusal record, which no client view shows. Your message and the
// model's reply carry their text while its key exists; a forgotten one keeps its place with none.
export function toContractRecord(record: LogRecord): ContractRecord | null {
  if (record.thread === null) {
    return null;
  }

  const message = messageKinds.has(record.kind) ? toMessage(record) : undefined;
  const task = record.kind.startsWith('task.') ? toTask(record) : undefined;
  const toolCall = toolKinds.has(record.kind) ? toToolCall(record) : undefined;
  const recall = record.kind === 'memory.recalled' ? toRecall(record) : undefined;
  const rating = record.kind === 'memory.rated' ? toRating(record) : undefined;

  return {
    ...toSessionFields(record),
    ...(forgetKinds.has(record.kind) ? toForget(record) : {}),
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

// your message, and a reply from the conversation's model
const messageKinds: ReadonlySet<string> = new Set(['owner_message', 'model.reply']);

type Message = NonNullable<ContractRecord['message']>;

function toMessage(record: LogRecord): Message | undefined {
  if (record.erasable.status !== 'readable') {
    return undefined;
  }

  const text = record.erasable.fields['text'];
  const clientMessageId = record.payload['clientMessageId'];

  if (typeof text !== 'string') {
    return undefined;
  }

  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- writeOwnerMessage wrote the spans
  const spans = record.erasable.fields['spans'] as readonly Span[] | undefined;

  return {
    ...(typeof clientMessageId === 'string' ? { clientMessageId } : {}),
    ...(spans === undefined ? {} : { spans: [...spans] }),
    text,
  };
}

type Task = NonNullable<ContractRecord['task']>;

// A step's start names its step in the payload, and its commit in the record's own step key. A
// failed step's record holds the error's message as its one erasable field, and a forgotten one
// keeps its task, step and retry with no error.
function toTask(record: LogRecord): Task | undefined {
  const taskID = record.payload['taskID'];
  const payloadKey = record.payload['stepKey'];
  const stepKey = typeof payloadKey === 'string' ? payloadKey : record.stepKey;

  const error =
    record.kind === 'task.step_errored' && record.erasable.status === 'readable'
      ? record.erasable.fields['message']
      : undefined;

  if (typeof taskID !== 'string') {
    return undefined;
  }

  return {
    ...(typeof error === 'string' ? { error } : {}),
    ...(record.kind === 'task.step_errored' ? toRetry(record.payload) : {}),
    ...(typeof stepKey === 'string' ? { stepKey } : {}),
    taskID,
  };
}

// A failed step's errors in a row, the limit in force, which a record from before the limit was
// recorded lacks, and the time its task tries again.
function toRetry(payload: LogRecord['payload']): Pick<Task, 'errorLimit' | 'errors' | 'retryAt'> {
  const errors = payload['errors'];
  const errorLimit = payload['errorLimit'];
  const claimableAt = payload['claimableAt'];

  return {
    ...(typeof errorLimit === 'number' ? { errorLimit } : {}),
    ...(typeof errors === 'number' ? { errors } : {}),
    ...(typeof claimableAt === 'number' ? { retryAt: new Date(claimableAt) } : {}),
  };
}

// a tool call, and the result that answers it
const toolKinds: ReadonlySet<string> = new Set(['tool_called', 'tool_result']);

type ToolCall = NonNullable<ContractRecord['toolCall']>;

// The call's record holds its input as its one erasable field, and the result's record holds the
// content the tool returned. A forgotten call keeps its tool and outcome with no content.
function toToolCall(record: LogRecord): ToolCall | undefined {
  const callID = record.payload['callID'];
  const tool = record.payload['tool'];
  const outcome = record.payload['outcome'];

  if (typeof callID !== 'string') {
    return undefined;
  }

  const fields = record.erasable.status === 'readable' ? record.erasable.fields : undefined;
  const input = record.kind === 'tool_called' ? fields?.['input'] : undefined;
  const content = record.kind === 'tool_result' ? fields : undefined;

  return {
    callID,
    ...(content === undefined ? {} : { content: { ...content } }),
    ...(isJSONObject(input) ? { input: { ...input } } : {}),
    ...(typeof outcome === 'string' ? { outcome } : {}),
    ...(typeof tool === 'string' ? { tool } : {}),
  };
}

type Recall = NonNullable<ContractRecord['recall']>;

type RecallItem = Recall['items'][number];

// A recall's record lists the versions it delivered, each with its match score when a query ranked
// it, and holds no text. An item without an ID and a version is left out.
function toRecall(record: LogRecord): Recall {
  const items = record.payload['items'];

  return { items: isJSONArray(items) ? items.flatMap((item) => toRecallItem(item)) : [] };
}

function toRecallItem(item: JSONValue): readonly RecallItem[] {
  if (!isJSONObject(item)) {
    return [];
  }

  const itemID = item['itemID'];
  const version = item['version'];
  const score = item['score'];

  if (typeof itemID !== 'string' || typeof version !== 'number') {
    return [];
  }

  return [{ itemID, version, ...(typeof score === 'number' ? { score } : {}) }];
}

type Rating = NonNullable<ContractRecord['rating']>;

type RatingItem = Rating['items'][number];

// A rating's record names the recall it rates and each item's verdict, and holds each note sealed,
// which memory.readRatingNotes opens. A record that names no recall gives no rating, and an item
// without an ID, a version and a known verdict is left out.
function toRating(record: LogRecord): Rating | undefined {
  const recalledSequence = record.payload['recalledSequence'];
  const ratedBy = record.payload['ratedBy'];
  const items = record.payload['ratings'];

  if (typeof recalledSequence !== 'number') {
    return undefined;
  }

  return {
    items: isJSONArray(items) ? items.flatMap((item) => toRatingItem(item)) : [],
    ...(typeof ratedBy === 'string' ? { ratedBy } : {}),
    recalledSequence,
  };
}

const verdicts: ReadonlySet<string> = new Set(['helpful', 'noise', 'misleading']);

function toRatingItem(item: JSONValue): readonly RatingItem[] {
  if (!isJSONObject(item)) {
    return [];
  }

  const itemID = item['itemID'];
  const version = item['version'];
  const verdict = item['verdict'];

  if (typeof itemID !== 'string' || typeof version !== 'number' || !isVerdict(verdict)) {
    return [];
  }

  return [{ hasNote: typeof item['sealedNote'] === 'string', itemID, verdict, version }];
}

function isVerdict(value: JSONValue | undefined): value is RatingItem['verdict'] {
  return typeof value === 'string' && verdicts.has(value);
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
  const size = record.payload['contextSize'];
  const window = record.payload['contextWindow'];

  return typeof size === 'number' && typeof window === 'number' ? { size, window } : undefined;
}

type Compaction = NonNullable<ContractRecord['compaction']>;

// A compaction's record holds its trigger and its token counts, and a null after count when the
// session reported none.
function toCompaction(record: LogRecord): Compaction | undefined {
  const trigger = record.payload['trigger'];
  const preTokens = record.payload['preTokens'];
  const postTokens = record.payload['postTokens'];

  if ((trigger !== 'manual' && trigger !== 'auto') || typeof preTokens !== 'number') {
    return undefined;
  }

  return { ...(typeof postTokens === 'number' ? { postTokens } : {}), preTokens, trigger };
}

type Summary = NonNullable<ContractRecord['summary']>;

// A summary's record holds what asked for it and its sizes, and its text while its key exists. A
// summary a forget erased keeps its place with no text.
function toSummary(record: LogRecord): Summary | undefined {
  const trigger = record.payload['trigger'];
  const contextSize = record.payload['contextSize'];
  const summaryTokens = record.payload['summaryTokens'];
  const text = record.erasable.status === 'readable' ? record.erasable.fields['text'] : undefined;

  if ((trigger !== 'threshold' && trigger !== 'overflow') || typeof summaryTokens !== 'number') {
    return undefined;
  }

  return {
    ...(typeof contextSize === 'number' ? { contextSize } : {}),
    summaryTokens,
    ...(typeof text === 'string' ? { text } : {}),
    trigger,
  };
}

type CompactionFailure = NonNullable<ContractRecord['compactionFailure']>;

// A failed compaction's record counts the failures in a row; its error stays out of the client.
function toCompactionFailure(record: LogRecord): CompactionFailure | undefined {
  const failures = record.payload['failures'];

  return typeof failures === 'number' && failures > 0 ? { failures } : undefined;
}

// the start and the end of a forget of your message or a reply
const forgetKinds: ReadonlySet<string> = new Set(['record.forget_started', 'record.forgotten']);

function toForget(record: LogRecord): Pick<ContractRecord, 'forget'> {
  const sequence = record.payload['recordSequence'];

  return typeof sequence === 'number' ? { forget: { sequence } } : {};
}

function isJSONArray(value: JSONValue | undefined): value is readonly JSONValue[] {
  return Array.isArray(value);
}

function isJSONObject(value: JSONValue | undefined): value is JSONObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
