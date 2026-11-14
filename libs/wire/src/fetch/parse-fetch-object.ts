const decoder = new TextDecoder('utf-8', { fatal: true });

export function parseFetchObject(
  bytes: Uint8Array,
  name: 'request' | 'reply',
): Readonly<Record<string, unknown>> {
  const value: unknown = JSON.parse(decoder.decode(bytes));

  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError(`a fetch ${name} must be a JSON object`);
  }

  return Object.fromEntries(Object.entries(value));
}
