// Builds the turn-input log's search for an own secret value. It reads the values at each search,
// looks for each value's UTF-8 bytes and for its JSON-escaped form, and never for a pattern of a
// kind of secret.
export function makeOwnValueSearch(
  readOwnValues: () => readonly string[],
): (body: Uint8Array) => boolean {
  return (body) => {
    const needles = readOwnValues().flatMap((value) => {
      const escaped = JSON.stringify(value).slice(1, -1);

      return [Buffer.from(value, 'utf8'), Buffer.from(escaped, 'utf8')];
    });

    const haystack = Buffer.from(body.buffer, body.byteOffset, body.byteLength);

    return needles.some((needle) => haystack.includes(needle));
  };
}
