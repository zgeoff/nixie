const migrationFileNamePattern = /^(?<number>\d{4})-[a-z0-9-]+\.ts$/u;

export function parseMigrationFileName(fileName: string): number | null {
  const match = migrationFileNamePattern.exec(fileName);

  if (match?.groups?.['number'] === undefined) {
    return null;
  }

  return Number(match.groups['number']);
}
