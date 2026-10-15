// oxlint-disable typescript/prefer-readonly-parameter-types -- a RegExp match and the maps the codemod fills have no readonly form
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { $ } from 'bun';

// Moves files between packages, each pair `from=to` from the repo root with its test beside it,
// and sends every import of a moved name to its new home. An index needs its exports by hand. The
// commit that ran it gives its command line.
async function runMoves(pairs: readonly string[]): Promise<void> {
  const moves = await collectMoves(pairs);

  for (const [from, to] of moves) {
    // oxlint-disable-next-line no-await-in-loop -- git takes one move at a time
    await mkdir(dirname(to), { recursive: true });

    // oxlint-disable-next-line no-await-in-loop -- git takes one move at a time
    await $`git mv ${from} ${to}`;
  }

  const homes = await collectNameHomes(moves);
  const tracked = await $`git ls-files '*.ts' '*.tsx'`.text();

  for (const file of tracked.split('\n').filter((path) => path !== '')) {
    // oxlint-disable-next-line no-await-in-loop -- each file is read and written once
    await updateImports(file, findOldPath(moves, file), { moves, homes });
  }
}

// every pair with its test, when the test exists
async function collectMoves(pairs: readonly string[]): Promise<Map<string, string>> {
  const moves = new Map<string, string>();

  for (const pair of pairs) {
    const [from = '', to = ''] = pair.split('=');
    const fromTest = from.replace(/\.ts$/u, '.test.ts');

    moves.set(from, to);

    // oxlint-disable-next-line no-await-in-loop -- one check per pair
    const hasTest = await Bun.file(fromTest).exists();

    if (hasTest) {
      moves.set(fromTest, to.replace(/\.ts$/u, '.test.ts'));
    }
  }

  return moves;
}

// the new file of each name a moved file exports
async function collectNameHomes(moves: ReadonlyMap<string, string>): Promise<Map<string, string>> {
  const homes = new Map<string, string>();

  for (const to of moves.values()) {
    // oxlint-disable-next-line no-await-in-loop -- each file is read once
    const source = await readFile(to, 'utf8');

    for (const match of source.matchAll(exportPattern)) {
      homes.set(match.groups?.['name'] ?? '', to);
    }
  }

  return homes;
}

const exportPattern =
  /^export\s+(?:declare\s+)?(?:async\s+)?(?:function\*?|const|let|class|interface|type|enum)\s+(?<name>\w+)/gmu;

function findOldPath(moves: ReadonlyMap<string, string>, file: string): string {
  return [...moves].find(([, to]) => to === file)?.[0] ?? file;
}

interface MovePlan {
  readonly moves: ReadonlyMap<string, string>;
  readonly homes: ReadonlyMap<string, string>;
}

async function updateImports(file: string, oldPath: string, plan: MovePlan): Promise<void> {
  const source = await readFile(file, 'utf8');

  const routed = buildRoutedImports(source, (specifier, name) =>
    resolveSpecifier({ file, oldPath, specifier, name }, plan),
  );

  if (routed !== source) {
    await writeFile(file, routed);
  }
}

interface ImportSite {
  // the importing file where it stands now, and where it stood before the move
  readonly file: string;
  readonly oldPath: string;
  readonly specifier: string;
  readonly name: string;
}

// A moved name imported from its old file or package goes to its new file. A relative import of a
// file that stayed goes to that file from wherever the importer stands now. Any other import keeps
// its specifier.
function resolveSpecifier(site: ImportSite, plan: MovePlan): string {
  const home = plan.homes.get(getImportedName(site.name));

  const oldTarget = site.specifier.startsWith('.')
    ? join(dirname(site.oldPath), `${site.specifier}.ts`)
    : null;

  if (home !== undefined && isOldHome(site.specifier, oldTarget, findOldPath(plan.moves, home))) {
    return buildSpecifier(site.file, home);
  }

  if (oldTarget !== null && (site.file !== site.oldPath || plan.moves.has(oldTarget))) {
    return buildSpecifier(site.file, plan.moves.get(oldTarget) ?? oldTarget);
  }

  return site.specifier;
}

function isOldHome(specifier: string, oldTarget: string | null, oldHome: string): boolean {
  return oldTarget === null ? specifier === getPackageSpecifier(oldHome) : oldTarget === oldHome;
}

// the path from the importer to the target in one package, or the target package's entry point
function buildSpecifier(file: string, target: string): string {
  if (getPackageRoot(file) === getPackageRoot(target)) {
    const path = relative(dirname(file), target).replace(/\.ts$/u, '');

    return path.startsWith('.') ? path : `./${path}`;
  }

  return getPackageSpecifier(target);
}

function getPackageRoot(path: string): string {
  return path.split('/').slice(0, 2).join('/');
}

function getPackageSpecifier(path: string): string {
  const name = `@heynixie/${path.split('/')[1] ?? ''}`;

  return path.includes('/src/test-utils/') ? `${name}/test-utils` : name;
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

await runMoves(process.argv.slice(2));
