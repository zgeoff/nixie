import { join } from 'node:path';

const readImportPattern = /import \{ readMigrations \} from '\.\/read-migrations';\n/u;
const readCallPattern = /await readMigrations\(join\(import\.meta\.dir, 'migrations'\)\)/u;

export function renderBundledMigrations(
  source: string,
  directory: string,
  buildMigrationsPath: string,
  fileNames: readonly string[],
): string {
  if (!readImportPattern.test(source) || !readCallPattern.test(source)) {
    throw new Error('The schema module no longer calls readMigrations the way the bundle expects');
  }

  const imports = fileNames.map(
    (fileName, index) =>
      `import * as migration${index} from ${JSON.stringify(join(directory, fileName))};`,
  );

  const files = fileNames.map(
    (fileName, index) => `{ fileName: ${JSON.stringify(fileName)}, module: migration${index} }`,
  );

  return [
    ...imports,
    `import { buildMigrations } from ${JSON.stringify(buildMigrationsPath)};`,
    source
      .replace(readImportPattern, '')
      .replace(readCallPattern, `buildMigrations([${files.join(', ')}])`),
  ].join('\n');
}
