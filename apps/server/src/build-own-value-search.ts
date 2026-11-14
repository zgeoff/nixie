// Builds the turn-input log's search for an own secret value. It looks for each value's UTF-8 bytes
// and for its JSON-escaped form, and never for a pattern of a kind of secret.
export function buildOwnValueSearch(ownValues: readonly string[]): (body: Uint8Array) => boolean {
  const needles = ownValues.flatMap((value) => {
    const escaped = JSON.stringify(value).slice(1, -1);

    return [Buffer.from(value, 'utf8'), Buffer.from(escaped, 'utf8')];
  });

  return (body) => {
    const haystack = Buffer.from(body.buffer, body.byteOffset, body.byteLength);

    return needles.some((needle) => haystack.includes(needle));
  };
}
