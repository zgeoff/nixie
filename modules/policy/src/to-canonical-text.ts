import type { JSONValue } from '@heynixie/log';

// Keys sorted, no spaces: the text that a hash covers.
export function toCanonicalText(value: JSONValue): string {
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
