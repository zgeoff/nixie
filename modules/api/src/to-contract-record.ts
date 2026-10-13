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

  return {
    kind: record.kind,
    ...(message === undefined ? {} : { message }),
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
// keeps its task and step with no error.
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
    ...(typeof stepKey === 'string' ? { stepKey } : {}),
    taskID,
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

function isJSONObject(value: JSONValue | undefined): value is JSONObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
