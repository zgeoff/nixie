import { join } from 'node:path';
import { Kysely } from 'kysely';
import { buildSqliteWorkerDialect } from './build-sqlite-worker-dialect';
import type { SchemaObject } from './read-schema-objects';
import { readSchemaObjects } from './read-schema-objects';
import { runMigrations } from './run-migrations';
import type { BuildSchema, Migration } from './types';

// What the last release's build knew about its schema: each migration's name in order, its oldest
// reader, and the schema objects its migrations build. The release tag's own tree reports it.
export interface ReleasedSchema {
  readonly migrations: readonly string[];
  readonly oldestReader: number;
  readonly objects: readonly SchemaObject[];
}

interface AddedMigration {
  // the schema version the migration leaves
  readonly version: number;
  readonly name: string;

  // each statement that is not an expand statement, when the build keeps the schema readable
  readonly refused: readonly string[];
}

export interface MigrationCheck {
  // each released migration whose name this build changed, removed or moved
  readonly changed: readonly string[];

  // each schema object that the released migrations build differently in this build
  readonly changedObjects: readonly string[];
  readonly added: readonly AddedMigration[];

  // false when the build raised oldestReader past the last release's schema version, which
  // declares that the release before cannot read what this build leaves
  readonly readableByReleaseBefore: boolean;
}

// Checks the migrations against the last release on a scratch database in dir: the released ones
// must build the schema they built at the release, and a build that keeps its schema readable adds
// only expand statements. With no release before it (released null), every migration passes.
export async function checkMigrations(
  schema: BuildSchema,
  released: ReleasedSchema | null,
  dir: string,
): Promise<MigrationCheck> {
  const releasedNames = released?.migrations ?? [];
  const readableByReleaseBefore = schema.oldestReader <= releasedNames.length;
  const run = await runRecordedMigrations(schema.migrations, releasedNames.length, dir);
  const newTables = collectCreatedTables(run.added.flatMap((migration) => migration.statements));
  const lint = released !== null && readableByReleaseBefore;

  return {
    changed: releasedNames.filter((name, index) => schema.migrations[index]?.name !== name),
    changedObjects: released === null ? [] : collectChangedObjects(released.objects, run.objects),
    added: run.added.map((migration) => ({
      version: migration.version,
      name: migration.name,
      refused: lint
        ? migration.statements.filter((statement) => !isExpandStatement(statement, newTables))
        : [],
    })),
    readableByReleaseBefore,
  };
}

interface RecordedMigration {
  readonly version: number;
  readonly name: string;
  readonly statements: readonly string[];
}

interface RecordedRun {
  // the schema objects after the released migrations, before the added ones
  readonly objects: readonly SchemaObject[];
  readonly added: readonly RecordedMigration[];
}

// The dialect runs a transaction's begin and commit as queries too, and they belong to the check.
const transactionControl = /^(?:begin|commit|rollback|savepoint|release)\b/u;

// Applies the released migrations and reads the schema they built, then runs each added one in its
// own transaction with every statement it sends recorded.
async function runRecordedMigrations(
  migrations: readonly Migration[],
  releasedCount: number,
  dir: string,
): Promise<RecordedRun> {
  const statements: string[] = [];
  const db = new Kysely<unknown>({
    dialect: buildSqliteWorkerDialect(join(dir, 'check-migrations.db')),
    log: (event) => {
      if (!transactionControl.test(event.query.sql.trim().toLowerCase())) {
        statements.push(event.query.sql);
      }
    },
  });

  try {
    await runMigrations(db, {
      schema: { migrations: migrations.slice(0, releasedCount), oldestReader: 0 },
      copyDir: dir,
    });
    const objects = await readSchemaObjects(db);
    const added = await runAddedMigrations(
      { db, drainStatements: () => statements.splice(0) },
      migrations.slice(releasedCount),
      releasedCount,
    );

    return { objects, added };
  } finally {
    await db.destroy();
  }
}

// the scratch database, and the statements its log recorded since the last drain
interface StatementRecorder {
  readonly db: Kysely<unknown>;
  readonly drainStatements: () => readonly string[];
}

// Runs each added migration in turn and takes the statements the log recorded for it.
async function runAddedMigrations(
  recorder: StatementRecorder,
  added: readonly Migration[],
  releasedCount: number,
): Promise<RecordedMigration[]> {
  const recorded: RecordedMigration[] = [];

  for (const [index, migration] of added.entries()) {
    recorder.drainStatements();

    // oxlint-disable-next-line no-await-in-loop -- each migration builds on the one before it
    await recorder.db.transaction().execute((tx) => migration.up(tx));
    recorded.push({
      version: releasedCount + index + 1,
      name: migration.name,
      statements: recorder.drainStatements(),
    });
  }
  return recorded;
}

function collectChangedObjects(
  released: readonly SchemaObject[],
  built: readonly SchemaObject[],
): string[] {
  const builtByName = new Map(built.map((object) => [object.name, object]));
  const releasedNames = new Set(released.map((object) => object.name));
  const differing = released.filter((object) => {
    const match = builtByName.get(object.name);

    return (
      match === undefined ||
      match.type !== object.type ||
      match.tableName !== object.tableName ||
      match.sql !== object.sql
    );
  });

  return [
    ...differing.map((object) => object.name),
    ...built.filter((object) => !releasedNames.has(object.name)).map((object) => object.name),
  ];
}

const createTable = /^create table (?:if not exists )?(?<table>[^\s(]+)/u;
const createIndex = /^create (?<unique>unique )?index (?:if not exists )?\S+ on (?<table>[^\s(]+)/u;
const addColumn = /^alter table (?<table>\S+) add (?:column )?(?<definition>.+)$/u;

// the tables that the added migrations create, which the release before never reads or writes
function collectCreatedTables(statements: readonly string[]): ReadonlySet<string> {
  return new Set(
    statements.flatMap((statement) => {
      const table = createTable.exec(normalizeStatement(statement))?.groups?.['table'];

      return table === undefined ? [] : [normalizeTable(table)];
    }),
  );
}

// A new table, an index the release before cannot trip, or a column the release before can leave
// out of its inserts: it reads and writes around each of them. A unique index or a constrained
// column passes only on a table the release creates.
function isExpandStatement(statement: string, newTables: ReadonlySet<string>): boolean {
  const normalized = normalizeStatement(statement);
  const index = createIndex.exec(normalized)?.groups;
  const column = addColumn.exec(normalized)?.groups;

  if (createTable.test(normalized)) {
    return true;
  }
  if (index !== undefined) {
    return index['unique'] === undefined || newTables.has(normalizeTable(index['table'] ?? ''));
  }
  if (column !== undefined) {
    return (
      newTables.has(normalizeTable(column['table'] ?? '')) ||
      isOptionalColumn(column['definition'] ?? '')
    );
  }
  return false;
}

// an insert that leaves the column out still succeeds: no check, and a default for not null
function isOptionalColumn(definition: string): boolean {
  return (
    !/\bcheck\b/u.test(definition) &&
    (!/\bnot null\b/u.test(definition) || /\bdefault\b/u.test(definition))
  );
}

function normalizeStatement(statement: string): string {
  return statement.trim().replaceAll(/\s+/gu, ' ').toLowerCase();
}

function normalizeTable(table: string): string {
  return table.replaceAll(/["`[\]]/gu, '').replace(/^main\./u, '');
}
