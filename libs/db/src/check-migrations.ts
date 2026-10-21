import { join } from 'node:path';
import { Kysely } from 'kysely';
import { buildSqliteWorkerDialect } from './build-sqlite-worker-dialect';
import type { SchemaObject } from './read-schema-objects';
import { readSchemaObjects } from './read-schema-objects';
import { runMigrations } from './run-migrations';
import type { BuildSchema, Migration } from './types';

export interface ReleasedSchema {
  readonly migrations: readonly string[];
  readonly oldestReader: number;
  readonly objects: readonly SchemaObject[];
}

interface AddedMigration {
  readonly version: number;
  readonly name: string;

  readonly refused: readonly string[];
}

export interface MigrationCheck {
  readonly changed: readonly string[];

  readonly changedObjects: readonly string[];
  readonly added: readonly AddedMigration[];

  readonly readableByReleaseBefore: boolean;
}

export async function checkMigrations(
  schema: BuildSchema,
  released: ReleasedSchema | null,
  directory: string,
): Promise<MigrationCheck> {
  const releasedNames = released?.migrations ?? [];
  const readableByReleaseBefore = schema.oldestReader <= releasedNames.length;

  const run = await runRecordedMigrations(schema.migrations, releasedNames.length, directory);

  const added = collectAddedSchema(run.added.flatMap((migration) => migration.statements));
  const lint = released !== null && readableByReleaseBefore;

  return {
    changed: releasedNames.filter((name, index) => schema.migrations[index]?.name !== name),
    changedObjects: released === null ? [] : collectChangedObjects(released.objects, run.objects),
    added: run.added.map((migration) => ({
      version: migration.version,
      name: migration.name,
      refused: lint
        ? migration.statements.filter((statement) => !isExpandStatement(statement, added))
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
  readonly objects: readonly SchemaObject[];
  readonly added: readonly RecordedMigration[];
}

const transactionControl = /^(?:begin|commit|rollback|savepoint|release)\b/u;

async function runRecordedMigrations(
  migrations: readonly Migration[],
  releasedCount: number,
  directory: string,
): Promise<RecordedRun> {
  const statements: string[] = [];

  const db = new Kysely<unknown>({
    dialect: buildSqliteWorkerDialect(join(directory, 'check-migrations.db')),
    log: (event) => {
      if (!transactionControl.test(event.query.sql.trim().toLowerCase())) {
        statements.push(event.query.sql);
      }
    },
  });

  try {
    await runMigrations(db, {
      schema: { migrations: migrations.slice(0, releasedCount), oldestReader: 0 },
      copyDir: directory,
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

interface StatementRecorder {
  readonly db: Kysely<unknown>;
  readonly drainStatements: () => readonly string[];
}

async function runAddedMigrations(
  recorder: StatementRecorder,
  added: readonly Migration[],
  releasedCount: number,
): Promise<RecordedMigration[]> {
  const recorded: RecordedMigration[] = [];

  for (const [index, migration] of added.entries()) {
    recorder.drainStatements();

    await recorder.db.transaction().execute((tx) => migration.up(tx));

    recorded.push({
      version: releasedCount + index + 1,
      name: migration.name,
      statements: recorder.drainStatements(),
    });
  }

  return recorded;
}

const createTable = /^create table (?:if not exists )?(?<table>[^\s(]+)/u;
const addColumn = /^alter table (?<table>\S+) add (?:column )?(?<definition>.+)$/u;

interface AddedSchema {
  readonly tables: readonly string[];
  readonly columns: readonly string[];
}

function collectAddedSchema(statements: readonly string[]): AddedSchema {
  const normalized = statements.map((statement) => normalizeStatement(statement));

  return {
    tables: normalized.flatMap((statement) => {
      const table = createTable.exec(statement)?.groups?.['table'];

      return table === undefined ? [] : [normalizeTable(table)];
    }),
    columns: normalized.flatMap((statement) => {
      const column = addColumn.exec(statement)?.groups;
      const definition = column?.['definition'] ?? '';

      return column === undefined || /\b(?:not null|default)\b/u.test(definition)
        ? []
        : [buildColumnName(column['table'] ?? '', definition.split(' ').at(0) ?? '')];
    }),
  };
}

function normalizeStatement(statement: string): string {
  return statement.trim().replaceAll(/\s+/gu, ' ').toLowerCase();
}

function normalizeTable(table: string): string {
  return table.replaceAll(/["`[\]]/gu, '').replace(/^main\./u, '');
}

function buildColumnName(table: string, column: string): string {
  return `${normalizeTable(table)}.${normalizeTable(column)}`;
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

const select = /^select\b/u;

function isExpandStatement(statement: string, added: AddedSchema): boolean {
  const normalized = normalizeStatement(statement);

  return (
    createTable.test(normalized) ||
    select.test(normalized) ||
    isExpandIndex(normalized, added) ||
    isExpandColumn(normalized, added) ||
    isExpandTrigger(normalized, added) ||
    isBackfill(normalized, added)
  );
}

const createIndex =
  /^create (?<unique>unique )?index (?:if not exists )?\S+ on (?<table>[^\s(]+) ?\((?<columns>[^)]*)\)/u;

// SQLite's unique index admits any number of nulls, so the release before stays valid when it
// leaves the added columns null.
function isExpandIndex(statement: string, added: AddedSchema): boolean {
  const index = createIndex.exec(statement)?.groups;

  return (
    index !== undefined &&
    (index['unique'] === undefined ||
      isAddedSchema(added, index['table'] ?? '', splitColumns(index['columns'] ?? '')))
  );
}

function isAddedSchema(added: AddedSchema, table: string, columns: readonly string[]): boolean {
  return (
    added.tables.includes(normalizeTable(table)) ||
    (columns.length > 0 &&
      columns.every((name) => added.columns.includes(buildColumnName(table, name))))
  );
}

function splitColumns(columns: string): readonly string[] {
  return columns.split(',').map((column) => column.trim().split(' ').at(0) ?? '');
}

function isExpandColumn(statement: string, added: AddedSchema): boolean {
  const column = addColumn.exec(statement)?.groups;

  return (
    column !== undefined &&
    (added.tables.includes(normalizeTable(column['table'] ?? '')) ||
      isOptionalColumn(column['definition'] ?? ''))
  );
}

function isOptionalColumn(definition: string): boolean {
  return (
    !/\bcheck\b/u.test(definition) &&
    (!/\bnot null\b/u.test(definition) || /\bdefault\b/u.test(definition))
  );
}

const createTrigger =
  /^create trigger (?:if not exists )?\S+ (?:before |after |instead of )?(?:insert|update|delete)(?: of .*?)? on (?<table>\S+)/u;

function isExpandTrigger(statement: string, added: AddedSchema): boolean {
  const table = createTrigger.exec(statement)?.groups?.['table'];

  return table !== undefined && added.tables.includes(normalizeTable(table));
}

const update = /^update (?<table>\S+) set (?<assignments>.+?)(?: where .*)?$/u;

function isBackfill(statement: string, added: AddedSchema): boolean {
  const backfill = update.exec(statement)?.groups;

  return (
    backfill !== undefined &&
    isAddedSchema(
      added,
      backfill['table'] ?? '',
      splitAssignedColumns(backfill['assignments'] ?? ''),
    )
  );
}

function splitAssignedColumns(assignments: string): readonly string[] {
  return assignments
    .split(',')
    .map(
      (assignment) => /^(?<column>[^\s=]+) ?=/u.exec(assignment.trim())?.groups?.['column'] ?? '',
    );
}
