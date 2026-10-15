// oxlint-disable typescript/prefer-readonly-parameter-types -- a RegExp match and the maps the codemod fills have no readonly form
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { $ } from 'bun';

// A one-off codemod, kept as the record of a mechanical change: it moves every file of models but
// the profiles and the cost into modules/sessions, and sends each import to the package that now
// exports its name. Run from the repo root with `bun scripts/split-sessions-module.ts`.
const fromSource = 'modules/models/src';
const toSource = 'modules/sessions/src';

// the files that stay in models, by their path under src without the extension
const keptFiles = new Set([
  'build-call-cost',
  'build-model-grant',
  'build-model-record',
  'derive-model-secret',
  'get-cli-context-window',
  'index',
  'models-config-schema',
  'nixie-test-build.d',
  'resolve-model-credentials',
  'resolve-role-profile',
  'to-turn-profile',
  'types',
  'test-utils/build-mock-model-profile',
  'test-utils/build-mock-models-config',
]);

// the names the models package exports once the move is done
const modelsNames = new Set([
  'CallUsage',
  'ModelPrices',
  'ModelProfile',
  'ModelRecordFields',
  'ModelRecordSource',
  'ModelRole',
  'ModelSecrets',
  'ModelsConfig',
  'ReasoningEffort',
  'ResolvedProfile',
  'buildCallCost',
  'buildModelGrant',
  'buildModelRecord',
  'deriveModelSecret',
  'getCLIContextWindow',
  'modelsConfigSchema',
  'resolveModelCredentials',
  'resolveRoleProfile',
  'toTurnProfile',
]);

async function runMove(): Promise<void> {
  const moved = await collectMovedFiles();

  await mkdir(join(toSource, 'test-utils'), { recursive: true });

  for (const file of moved) {
    // oxlint-disable-next-line no-await-in-loop -- git takes one move at a time
    await $`git mv ${join(fromSource, file)} ${join(toSource, file)}`;
  }

  for (const file of moved.filter((name) => name.endsWith('.ts'))) {
    // oxlint-disable-next-line no-await-in-loop -- each file is read and written once
    await updateFile(join(toSource, file), (source) =>
      buildMovedImports(source, file.includes('/')),
    );
  }

  const tracked = await $`git ls-files '*.ts' '*.tsx'`.text();

  for (const file of tracked.split('\n').filter((path) => isConsumer(path))) {
    // oxlint-disable-next-line no-await-in-loop -- each file is read and written once
    await updateFile(file, (source) => buildSpikePaths(buildConsumerImports(source), moved));
  }
}

async function collectMovedFiles(): Promise<string[]> {
  const entries = await readdir(fromSource, { recursive: true, withFileTypes: true });

  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name).slice(fromSource.length + 1))
    .filter((file) => !keptFiles.has(file.replace(/(?:\.test)?\.ts$/u, '')));
}

function isConsumer(path: string): boolean {
  return (
    path !== '' && !path.startsWith('modules/models/') && !path.startsWith('modules/sessions/')
  );
}

async function updateFile(path: string, change: (source: string) => string): Promise<void> {
  const source = await readFile(path, 'utf8');

  const changed = change(source);

  if (changed !== source) {
    await writeFile(path, changed);
  }
}

// a moved file imports what stayed in models from the package, and keeps every other path
function buildMovedImports(source: string, isNested: boolean): string {
  const prefix = isNested ? '../' : './';

  return buildRoutedImports(source, (specifier, name) => {
    if (/build-mock-models?-(?:profile|config)$/u.test(specifier)) {
      return '@heynixie/models/test-utils';
    }

    const file = specifier.startsWith(prefix) ? specifier.slice(prefix.length) : null;

    if (file === 'types') {
      return modelsNames.has(getImportedName(name)) ? '@heynixie/models' : specifier;
    }

    return file !== null && keptFiles.has(file) ? '@heynixie/models' : specifier;
  });
}

// a consumer imports a name that left models from sessions
function buildConsumerImports(source: string): string {
  return buildRoutedImports(source, (specifier, name) =>
    specifier === '@heynixie/models' && !modelsNames.has(getImportedName(name))
      ? '@heynixie/sessions'
      : specifier,
  );
}

// a design spike imports module files by their path
function buildSpikePaths(source: string, moved: readonly string[]): string {
  return source.replaceAll(/\/modules\/models\/src\/(?<file>[a-z0-9-/]+)'/gu, (match) => {
    const file = match.slice('/modules/models/src/'.length, -1);

    return moved.includes(`${file}.ts`) ? `/modules/sessions/src/${file}'` : match;
  });
}

type Route = (specifier: string, name: string) => string;

interface ImportGroup {
  readonly specifier: string;
  readonly isType: boolean;
  readonly names: string[];
}

const importPattern =
  /import\s+(?<typeKeyword>type\s+)?\{(?<list>[^}]*)\}\s+from\s+'(?<specifier>[^']+)';/gu;

// Sends each imported name to the specifier the route picks, and merges the imports of one
// specifier and kind into the first statement that holds one of them.
function buildRoutedImports(source: string, route: Route): string {
  const statements = [...source.matchAll(importPattern)];
  const routed = collectImportGroups(statements, route);

  return routed.isChanged ? renderRoutedSource(source, statements, routed) : source;
}

function renderRoutedSource(
  source: string,
  statements: readonly RegExpExecArray[],
  routed: RoutedImports,
): string {
  const parts = statements.map((statement, index) => {
    const start = index === 0 ? 0 : getStatementEnd(statements[index - 1]);
    const keys = routed.owners.get(index) ?? [];
    const rendered = keys.map((key) => renderImport(routed.groups.get(key)));

    return source.slice(start, statement.index) + rendered.join('\n');
  });

  return parts.join('') + source.slice(getStatementEnd(statements.at(-1)));
}

function getStatementEnd(statement: RegExpExecArray | undefined): number {
  return statement === undefined ? 0 : statement.index + statement[0].length;
}

interface RoutedImports {
  readonly groups: ReadonlyMap<string, ImportGroup>;

  // the group keys each statement renders, by the statement's index
  readonly owners: ReadonlyMap<number, readonly string[]>;
  readonly isChanged: boolean;
}

function collectImportGroups(statements: readonly RegExpExecArray[], route: Route): RoutedImports {
  const groups = new Map<string, ImportGroup>();
  const owners = new Map<number, string[]>();

  const targets = statements.flatMap((statement, index) =>
    splitImportList(statement.groups?.['list'] ?? '').map((name) => {
      const specifier = statement.groups?.['specifier'] ?? '';
      const isType = statement.groups?.['typeKeyword'] !== undefined;
      const target = route(specifier, name);

      updateImportGroups(groups, owners, { index, name, target, isType });

      return target !== specifier;
    }),
  );

  return { groups, owners, isChanged: targets.includes(true) };
}

interface RoutedName {
  readonly index: number;
  readonly name: string;
  readonly target: string;
  readonly isType: boolean;
}

// adds a name to its group, and makes the statement it came from render a group that starts there
function updateImportGroups(
  groups: Map<string, ImportGroup>,
  owners: Map<number, string[]>,
  routed: RoutedName,
): void {
  const key = `${routed.isType ? 'type ' : ''}${routed.target}`;
  const group = groups.get(key);

  if (group === undefined) {
    groups.set(key, { specifier: routed.target, isType: routed.isType, names: [routed.name] });
    owners.set(routed.index, [...(owners.get(routed.index) ?? []), key]);
  } else {
    group.names.push(routed.name);
  }
}

function splitImportList(list: string): string[] {
  return list
    .split(',')
    .map((name) => name.trim())
    .filter((name) => name !== '');
}

function renderImport(group: ImportGroup | undefined): string {
  if (group === undefined) {
    throw new Error('an import group is missing');
  }

  const names = [...new Set(group.names)].join(', ');

  return `import ${group.isType ? 'type ' : ''}{ ${names} } from '${group.specifier}';`;
}

// the exported name an import list entry reads, without its type keyword or its alias
function getImportedName(entry: string): string {
  const [name = entry] = entry.replace(/^type\s+/u, '').split(/\s+as\s+/u);

  return name;
}

await runMove();
