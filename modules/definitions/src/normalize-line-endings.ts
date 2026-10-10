const carriageReturn = 13;

// Every definitions file is text, so a source turns its CRLF line endings into LF before the
// content hash and before a parser sees it. A checkout with core.autocrlf then hashes like the
// commit it came from.
export function normalizeLineEndings(bytes: Uint8Array): Uint8Array {
  if (!bytes.includes(carriageReturn)) {
    return bytes;
  }
  const lf: number[] = [];

  for (const [index, byte] of bytes.entries()) {
    if (byte !== carriageReturn || bytes[index + 1] !== 10) {
      lf.push(byte);
    }
  }
  return Uint8Array.from(lf);
}
