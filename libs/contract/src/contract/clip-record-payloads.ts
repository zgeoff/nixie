import type { LogRecord as ContractRecord } from '../types';
import { payloadClipBytes } from './payload-clip-bytes';

type Clipped = NonNullable<ContractRecord['clipped']>[number];

// Cuts each long string of the record's 4 payload fields, and lists each cut. A field that still
// passes the size limit after its cuts is left out and listed with an empty path.
export function clipRecordPayloads(record: ContractRecord): ContractRecord {
  const clipped: Clipped[] = [];
  let toolCall = record.toolCall;
  let worker = record.worker;

  if (toolCall !== undefined) {
    const input = clipObjectField(toolCall.input, 'toolCall.input', clipped);
    const content = clipObjectField(toolCall.content, 'toolCall.content', clipped);
    const { input: _input, content: _content, ...rest } = toolCall;

    toolCall = {
      ...rest,
      ...(input === undefined ? {} : { input }),
      ...(content === undefined ? {} : { content }),
    };
  }

  if (worker?.phase === 'turn' && worker.text !== undefined) {
    const cut = cutString(worker.text);

    if (cut !== null) {
      clipped.push({ field: 'worker.text', path: [], bytes: cut.bytes });

      worker = { ...worker, text: cut.text };
    }
  }

  if (worker?.phase === 'ended' && worker.detail !== undefined) {
    const cut = cutString(worker.detail);

    if (cut !== null) {
      clipped.push({ field: 'worker.detail', path: [], bytes: cut.bytes });

      worker = { ...worker, detail: cut.text };
    }
  }

  if (clipped.length === 0) {
    return record;
  }

  return {
    ...record,
    clipped,
    ...(toolCall === undefined ? {} : { toolCall }),
    ...(worker === undefined ? {} : { worker }),
  };
}

type PayloadField = Clipped['field'];

const maxFieldBytes = 64 * 1024;

function clipObjectField(
  value: Record<string, unknown> | undefined,
  field: PayloadField,
  clipped: Clipped[],
): Record<string, unknown> | undefined {
  if (value === undefined) {
    return undefined;
  }

  const found: Clipped[] = [];
  const cut = clipValue(value, field, [], found);
  const size = byteLength(JSON.stringify(cut));

  if (size > maxFieldBytes) {
    clipped.push({ field, path: [], bytes: byteLength(JSON.stringify(value)) });

    return undefined;
  }

  clipped.push(...found);

  return isObject(cut) ? cut : value;
}

function clipValue(
  value: unknown,
  field: PayloadField,
  path: (string | number)[],
  found: Clipped[],
): unknown {
  if (typeof value === 'string') {
    const cut = cutString(value);

    if (cut === null) {
      return value;
    }

    found.push({ field, path, bytes: cut.bytes });

    return cut.text;
  }

  if (Array.isArray(value)) {
    return value.map((item, index) => clipValue(item, field, [...path, index], found));
  }

  if (isObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        clipValue(item, field, [...path, key], found),
      ]),
    );
  }

  return value;
}

const decoder = new TextDecoder();

function cutString(text: string): { text: string; bytes: number } | null {
  const bytes = new TextEncoder().encode(text);

  if (bytes.length <= payloadClipBytes) {
    return null;
  }

  let end = payloadClipBytes;

  // a continuation byte starts no code point, so the cut backs up to the byte that does
  while (end > 0 && ((bytes[end] ?? 0) & 0xc0) === 0x80) {
    end -= 1;
  }

  return { text: decoder.decode(bytes.subarray(0, end)), bytes: bytes.length };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function byteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}
