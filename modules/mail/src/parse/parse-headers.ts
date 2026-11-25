// Reads the header block of a message into its values by lowercased name. A folded line joins the
// line before it.
export function parseHeaders(head: string): ReadonlyMap<string, readonly string[]> {
  const unfolded = head.replaceAll(/\r?\n[ \t]+/gu, ' ');

  const headers = new Map<string, string[]>();

  for (const line of unfolded.split(/\r?\n/u)) {
    const colon = line.indexOf(':');

    if (colon > 0) {
      const name = line.slice(0, colon).trim().toLowerCase();

      headers.set(name, [...(headers.get(name) ?? []), line.slice(colon + 1).trim()]);
    }
  }

  return headers;
}
