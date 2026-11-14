import type { JSONValue } from '@heynixie/log';

export function toCanonicalJSON(value: JSONValue): string {
  if (isJSONArray(value)) {
    return `[${value.map((item) => toCanonicalJSON(item)).join(',')}]`;
  }

  if (value !== null && typeof value === 'object') {
    const entries = Object.keys(value)
      .toSorted()
      .map((key) => `${JSON.stringify(key)}:${toCanonicalJSON(value[key] ?? null)}`);

    return `{${entries.join(',')}}`;
  }

  if (typeof value === 'number' && !Number.isFinite(value)) {
    throw new TypeError(`canonical JSON has no form for ${value}`);
  }

  return JSON.stringify(value);
}

// TypeScript narrows Array.isArray to a mutable array, which a readonly JSON array never matches.
function isJSONArray(value: JSONValue): value is readonly JSONValue[] {
  return Array.isArray(value);
}
