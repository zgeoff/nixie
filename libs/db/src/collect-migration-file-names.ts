export function collectMigrationFileNames(fileNames: readonly string[]): string[] {
  return fileNames
    .filter((fileName) => fileName.endsWith('.ts') && !fileName.endsWith('.test.ts'))
    .toSorted();
}
