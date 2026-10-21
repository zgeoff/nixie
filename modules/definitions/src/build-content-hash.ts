import { buildSHA256 } from './build-sha256';

export function buildContentHash(files: ReadonlyMap<string, Uint8Array>): string {
  // The default sort compares UTF-16 code units, so the path order never depends on the locale.
  const lines = [...files.keys()].toSorted().map((path) => {
    const bytes = files.get(path) ?? new Uint8Array();

    return `${path}\t${bytes.byteLength}\t${buildSHA256(bytes)}\n`;
  });

  return buildSHA256(`nixie-definitions-v1\n${lines.join('')}`);
}
