const encodedRunPattern = /(?:%[0-9A-Fa-f]{2})+/gu;

// Decodes each run of valid %XX escapes as UTF-8 bytes, with a replacement character for a byte
// sequence that is not UTF-8. It keeps a malformed % sequence as it is, and never throws.
export function decodePercentEncoding(text: string): string {
  return text.replaceAll(encodedRunPattern, (run) => {
    const bytes = new Uint8Array(run.length / 3);

    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Number.parseInt(run.slice(index * 3 + 1, index * 3 + 3), 16);
    }

    return new TextDecoder().decode(bytes);
  });
}
