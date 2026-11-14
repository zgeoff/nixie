import type { LogRecord } from '@heynixie/log';
import { toolResultCodec } from '@heynixie/tools';
import { swapToolResultUUIDs } from './swap-tool-result-uuids';
import type { ShortIDLookup } from './swapped-keys';

// The text of a tool result as the model reads it: the message, or the result, alone. A result of
// an earlier release can hold a search's costUSD, which the model never read, so the top-level
// costUSD is dropped unless the tool's sources name it.
export function formatToolEntry(
  record: LogRecord,
  fields: Readonly<Record<string, unknown>>,
  lookup: ShortIDLookup,
): string {
  const message = fields['message'];

  if (typeof message === 'string') {
    return JSON.stringify({ message });
  }

  if ('result' in fields) {
    return JSON.stringify({
      result: swapToolResultUUIDs(dropUnnamedCost(fields['result'], record), lookup),
    });
  }

  return JSON.stringify(fields);
}

function dropUnnamedCost(result: unknown, record: LogRecord): unknown {
  if (!isPlainObject(result) || !Object.hasOwn(result, 'costUSD')) {
    return result;
  }

  const sources = toolResultCodec.tryDecodePartial(record.payload)?.sources ?? {};

  if (Object.hasOwn(sources, 'costUSD')) {
    return result;
  }

  const { costUSD: _cost, ...rest } = result;

  return rest;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
