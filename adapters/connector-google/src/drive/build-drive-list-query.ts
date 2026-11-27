// The query of a files.list: the Drive `q` search and the other parameters, for every file of a
// shared drive too.
export function buildDriveListQuery(
  search: string,
  other: Readonly<Record<string, string>>,
): Record<string, string> {
  return Object.fromEntries([
    ['q', search],
    ['supportsAllDrives', 'true'],
    ['includeItemsFromAllDrives', 'true'],
    ...Object.entries(other),
  ]);
}
