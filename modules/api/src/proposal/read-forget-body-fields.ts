import type { JSONObject, Log, LogRecord } from '@heynixie/log';
import { readRecords } from '@heynixie/log';
import { readRecordForgetPreview } from '@heynixie/memory';
import type { BodyFields, BodyFieldsRequest } from '@heynixie/policy';

export const forgetToolName = 'log.forget';

// The card of a record's removal shows what goes: the record's kind and text, and how many moments
// and memory items go with it. The text is read when the card is read, and no record keeps a copy.
export async function readForgetBodyFields(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  request: BodyFieldsRequest,
): Promise<BodyFields> {
  if (request.tool !== forgetToolName) {
    return { status: 'none' };
  }

  const sequence = parseRecordSequence(request.input['record']);

  if (sequence === null || request.thread === null) {
    return { status: 'unreadable' };
  }

  try {
    const [entry] = await readRecords(log, { afterSequence: sequence - 1, limit: 1 });

    const record = entry?.record.sequence === sequence ? entry.record : undefined;

    if (record === undefined || record.thread !== request.thread) {
      return { status: 'unreadable' };
    }

    const preview = await readRecordForgetPreview(log, { thread: request.thread, sequence });

    return {
      status: 'fields',
      fields: {
        kind: record.kind,
        text: formatRecordText(record),
        moments: String(preview.momentCount),
        'memory items': String(preview.memoryItems.length),
      },
    };
  } catch {
    return { status: 'unreadable' };
  }
}

function parseRecordSequence(value: unknown): number | null {
  if (typeof value !== 'string') {
    return null;
  }

  const digits = /^#?(?<digits>\d{1,15})$/u.exec(value)?.groups?.['digits'];

  return digits === undefined ? null : Number(digits);
}

const textLimit = 2000;
const goneText = '(already removed)';

function formatRecordText(record: LogRecord): string {
  if (record.erasable.status !== 'readable') {
    return goneText;
  }

  const text = pickRecordText(record.kind, record.erasable.fields);

  return text.length > textLimit ? `${text.slice(0, textLimit)}…` : text;
}

function pickRecordText(kind: string, fields: JSONObject): string {
  const text = fields['text'];
  const body = fields['body'];
  const message = fields['message'];

  if ((kind === 'owner_message' || kind === 'model.reply') && typeof text === 'string') {
    return text;
  }

  if (kind === 'task_message' && typeof body === 'string') {
    return body;
  }

  if (kind === 'tool_called' && 'input' in fields) {
    return JSON.stringify(fields['input']);
  }

  if (kind === 'tool_result') {
    return typeof message === 'string' ? message : JSON.stringify(fields['result'] ?? fields);
  }

  return JSON.stringify(fields);
}
