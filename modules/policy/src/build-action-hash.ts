import { createHash } from 'node:crypto';
import type { JSONValue } from '@heynixie/log';

// The SHA-256 of the canonical operation: the tool, its input and its resolved destinations.
export interface ActionOperation {
  readonly tool: string;
  readonly input: JSONValue;
  readonly destinations: readonly string[];
}

export function buildActionHash(operation: ActionOperation): string {
  const canonical = {
    tool: operation.tool,
    input: operation.input,
    destinations: [...operation.destinations],
  };

  return createHash('sha256').update(toCanonicalText(canonical)).digest('hex');
}

function toCanonicalText(value: JSONValue): string {
  if (isJSONArray(value)) {
    return `[${value.map((item) => toCanonicalText(item)).join(',')}]`;
  }

  if (value !== null && typeof value === 'object') {
    const entries = Object.keys(value)
      .toSorted()
      .map((key) => `${JSON.stringify(key)}:${toCanonicalText(value[key] ?? null)}`);

    return `{${entries.join(',')}}`;
  }

  return JSON.stringify(value);
}

// TypeScript narrows Array.isArray to a mutable array, which a readonly JSON array never matches.
function isJSONArray(value: JSONValue): value is readonly JSONValue[] {
  return Array.isArray(value);
}
