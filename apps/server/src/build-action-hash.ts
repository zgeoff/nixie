import { createHash } from 'node:crypto';
import type { JSONObject, JSONValue } from '@heynixie/log';

// Builds the action hash of a tool call from its tool and its arguments, with every object's keys
// sorted, so a rerun's call with the same arguments in another key order matches the same action.
export function buildActionHash(tool: string, input: JSONObject): string {
  const canonical = renderCanonicalJSON({ tool, arguments: input });

  return `sha256:${createHash('sha256').update(canonical).digest('hex')}`;
}

function renderCanonicalJSON(value: JSONValue): string {
  if (isJSONArray(value)) {
    return `[${value.map((item) => renderCanonicalJSON(item)).join(',')}]`;
  }

  if (typeof value === 'object' && value !== null) {
    const entries = Object.entries(value)
      .toSorted(([a], [b]) => (a < b ? -1 : 1))
      .map(([key, item]) => `${JSON.stringify(key)}:${renderCanonicalJSON(item)}`);

    return `{${entries.join(',')}}`;
  }

  return JSON.stringify(value);
}

// Array.isArray narrows to any[], which loses the item type
function isJSONArray(value: JSONValue): value is readonly JSONValue[] {
  return Array.isArray(value);
}
