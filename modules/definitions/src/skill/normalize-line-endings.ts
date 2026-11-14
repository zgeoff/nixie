const carriageReturn = 13;

// A git checkout with core.autocrlf turns LF into CRLF, so the same commit hashes the same only
// after CRLF goes back to LF.
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
