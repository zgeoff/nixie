import { scrubText } from '@heynixie/egress';
import type { JSONObject, JSONValue } from '@heynixie/log';
import type { Settled } from './types';

// Cuts each own value out of a settled result, in its content and in its reply, and leaves the
// marker in its place so the model sees that something was cut.
export function removeOwnValues(settled: Settled, values: readonly string[]): Settled {
  if (values.length === 0) {
    return settled;
  }

  const reply =
    settled.reply.kind === 'text'
      ? { ...settled.reply, text: scrubText(settled.reply.text, values) }
      : { ...settled.reply, result: scrubObject(settled.reply.result, values) };

  return { ...settled, content: scrubObject(settled.content, values), reply };
}

function scrubObject(object: JSONObject, values: readonly string[]): JSONObject {
  return Object.fromEntries(
    Object.entries(object).map(([key, value]) => [
      scrubText(key, values),
      scrubValue(value, values),
    ]),
  );
}

function scrubValue(value: JSONValue, values: readonly string[]): JSONValue {
  if (typeof value === 'string') {
    return scrubText(value, values);
  }

  if (isJSONArray(value)) {
    return value.map((item) => scrubValue(item, values));
  }

  return value !== null && typeof value === 'object' ? scrubObject(value, values) : value;
}

function isJSONArray(value: JSONValue): value is readonly JSONValue[] {
  return Array.isArray(value);
}
