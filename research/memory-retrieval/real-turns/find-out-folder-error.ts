// A smaller rating sample writes fewer parts, so a part left from an earlier sample would pass as
// current.
export function findOutFolderError(folder: string, entries: readonly string[]): string | null {
  return entries.length === 0 ? null : `pass an empty or new --out folder: ${folder} already holds ${entries.length} files`;
}
