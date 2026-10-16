import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { $ } from 'bun';

// A one-off codemod, kept as the record of a mechanical change: it moves the JSON logger from
// modules/ops into libs/logger, and sends each import of a logger name to the new package. Run it
// from the repo root with `bun scripts/move-logger-to-lib.ts`.
const fromSource = 'modules/ops/src';
const toPackage = 'libs/logger';

const movedFiles = [
  'log-levels.ts',
  'make-logger.ts',
  'make-logger.test.ts',
  'make-threshold-logger.ts',
  'make-threshold-logger.test.ts',
  'to-error-fields.ts',
  'to-error-fields.test.ts',
];

const loggerNames = new Set([
  'LogFields',
  'LogLevel',
  'Logger',
  'logLevels',
  'makeLogger',
  'makeThresholdLogger',
  'toErrorFields',
]);

await mkdir(join(toPackage, 'src'), { recursive: true });

await Promise.all(
  movedFiles.map((file) => rename(join(fromSource, file), join(toPackage, 'src', file))),
);

await writeFile(
  join(toPackage, 'package.json'),
  `${JSON.stringify(
    {
      name: '@heynixie/logger',
      version: '0.0.0',
      private: true,
      type: 'module',
      sideEffects: false,
      exports: { '.': './src/index.ts' },
      scripts: { typecheck: 'tsc --noEmit' },
    },
    null,
    2,
  )}\n`,
);

await writeFile(
  join(toPackage, 'tsconfig.json'),
  `${JSON.stringify({ extends: '../../tsconfig.base.json', include: ['src/**/*.ts'] }, null, 2)}\n`,
);

await writeFile(
  join(toPackage, 'turbo.json'),
  `${JSON.stringify(
    { $schema: '../../node_modules/turbo/schema.json', extends: ['//'], tags: ['lib'] },
    null,
    2,
  )}\n`,
);

await writeFile(
  join(toPackage, 'src/index.ts'),
  [
    "export { logLevels } from './log-levels';",
    "export { makeLogger } from './make-logger';",
    "export { makeThresholdLogger } from './make-threshold-logger';",
    "export { toErrorFields } from './to-error-fields';",
    "export type { LogFields, Logger, LogLevel } from './types';",
    '',
  ].join('\n'),
);

// the logger's types leave ops's types file whole, with the comment above each
const opsTypesPath = join(fromSource, 'types.ts');

const opsTypes = await readFile(opsTypesPath, 'utf8');

const loggerTypesStart = opsTypes.indexOf('// A JSON log line');

await writeFile(
  join(toPackage, 'src/types.ts'),
  `import type { logLevels } from './log-levels';\n\n${opsTypes.slice(loggerTypesStart)}`,
);

await writeFile(
  opsTypesPath,
  `${opsTypes
    .slice(0, loggerTypesStart)
    .replace("import type { logLevels } from './log-levels';\n\n", '')
    .trimEnd()}\n`,
);

const opsIndexPath = join(fromSource, 'index.ts');

const opsIndex = await readFile(opsIndexPath, 'utf8');

await writeFile(
  opsIndexPath,
  opsIndex
    .split('\n')
    .filter(
      (line) =>
        !/'\.\/(?:log-levels|make-logger|make-threshold-logger|to-error-fields)'/u.test(line),
    )
    .join('\n')
    .replace(
      'export type { HealthReport, LogFields, Logger, LogLevel, PartCheck, PartReport }',
      'export type { HealthReport, PartCheck, PartReport }',
    ),
);

// each import from ops that names only logger names now comes from the logger package
const importPattern = /from '@heynixie\/ops';/u;

const listedFiles = await $`git ls-files 'apps/*.ts' 'modules/*.ts'`.text();

const sourceFiles = listedFiles.trim().split('\n');

await Promise.all(sourceFiles.map((path) => updateImports(path)));

async function updateImports(path: string): Promise<void> {
  // git still lists the files the move above took away
  if (!(await Bun.file(path).exists())) {
    return;
  }

  const source = await readFile(path, 'utf8');

  if (!importPattern.test(source)) {
    return;
  }

  const rewritten = source.replaceAll(
    /import (?:type )?\{(?<names>[^}]*)\} from '@heynixie\/ops';/gu,
    (statement, names: string) =>
      names
        .split(',')
        .map((name) => name.trim())
        .filter((name) => name !== '')
        .every((name) => loggerNames.has(name))
        ? statement.replace("'@heynixie/ops'", "'@heynixie/logger'")
        : statement,
  );

  await writeFile(path, rewritten);
}

// sessions logs and checks no health, so it trades ops for the logger; the server takes both
await updateDependencies('modules/sessions/package.json', ['@heynixie/ops']);
await updateDependencies('apps/server/package.json', []);

async function updateDependencies(path: string, removed: readonly string[]): Promise<void> {
  const text = await readFile(path, 'utf8');

  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- each manifest it edits names its dependencies
  const manifest = JSON.parse(text) as { dependencies: Record<string, string> };

  const dependencies = Object.entries({
    ...manifest.dependencies,
    '@heynixie/logger': 'workspace:*',
  }).filter(([name]) => !removed.includes(name));

  dependencies.sort(([left], [right]) => left.localeCompare(right));

  await writeFile(
    path,
    `${JSON.stringify({ ...manifest, dependencies: Object.fromEntries(dependencies) }, null, 2)}\n`,
  );
}
