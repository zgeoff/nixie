// The `q` of a Drive search for the text: the files, not in the trash, whose name or content holds it.
export function buildDriveSearchQuery(text: string): string {
  const escaped = text.replaceAll('\\', String.raw`\\`).replaceAll("'", String.raw`\'`);

  return `trashed = false and (name contains '${escaped}' or fullText contains '${escaped}')`;
}
