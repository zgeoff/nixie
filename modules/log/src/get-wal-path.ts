export function getWALPath(databasePath: string): string {
  return `${databasePath}-wal`;
}
