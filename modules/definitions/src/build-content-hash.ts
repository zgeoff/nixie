import { buildSHA256 } from './build-sha256';

// The content hash of a snapshot: a SHA-256 over the version line, then one line per file in path
// order with the path, its byte length and its own SHA-256. Git metadata, mode bits and file times
// never enter it, so the same files give the same hash from any source.
export function buildContentHash(files: ReadonlyMap<string, Uint8Array>): string {
  // the default sort compares UTF-16 code units, so path order never depends on the locale
  const lines = [...files.keys()].toSorted().map((path) => {
    const bytes = files.get(path) ?? new Uint8Array();

    return `${path}\t${bytes.byteLength}\t${buildSHA256(bytes)}\n`;
  });

  return buildSHA256(`nixie-definitions-v1\n${lines.join('')}`);
}
