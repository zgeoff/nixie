import { join } from 'node:path';
import { Kysely } from 'kysely';
import { buildSqliteWorkerDialect } from './build-sqlite-worker-dialect';
import { runMigrations } from './run-migrations';
import type { BuildSchema, Migration } from './types';

// What the last release's build knew about its schema: each migration's name in order, and its
// oldest reader. The compatibility check reads it from the release tag.
export interface ReleasedSchema {
  readonly migrations: readonly string[];
  readonly oldestReader: number;
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
  readonly added: readonly AddedMigration[];

  // false when the build raised oldestReader past the last release's schema version, which
  // declares that the release before cannot read what this build leaves
  readonly readableByReleaseBefore: boolean;
}

// Checks the migrations added since the last release on a scratch database in dir: a build that
// keeps its schema readable by the release before adds only expand statements. A build that
// declares the break, or has no release before it (released null), passes every statement.
export async function checkMigrations(
  schema: BuildSchema,
  released: ReleasedSchema | null,
  dir: string,
): Promise<MigrationCheck> {
  const releasedNames = released?.migrations ?? [];
  const readableByReleaseBefore = schema.oldestReader <= releasedNames.length;
  const lint = released !== null && readableByReleaseBefore;
  const recorded = await runRecordedMigrations(schema.migrations, releasedNames.length, dir);

  return {
    changed: releasedNames.filter((name, index) => schema.migrations[index]?.name !== name),
    added: recorded.map((migration) => ({
      version: migration.version,
      name: migration.name,
      refused: lint
        ? migration.statements.filter((statement) => !isExpandStatement(statement))
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

// The dialect runs a transaction's begin and commit as queries too, and they belong to the check.
const transactionControl = /^(?:begin|commit|rollback|savepoint|release)\b/u;

// Applies the released migrations, then runs each added one in its own transaction with every
// statement it sends recorded.
async function runRecordedMigrations(
  migrations: readonly Migration[],
  releasedCount: number,
  dir: string,
): Promise<RecordedMigration[]> {
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
    return await runAddedMigrations(
      { db, statements },
      migrations.slice(releasedCount),
      releasedCount,
    );
  } finally {
    await db.destroy();
  }
}

// the scratch database and the statements its log records since the last reset
interface StatementRecorder {
  readonly db: Kysely<unknown>;
  readonly statements: string[];
}

// Runs each added migration in turn and takes the statements the log recorded for it.
async function runAddedMigrations(
  recorder: StatementRecorder,
  added: readonly Migration[],
  releasedCount: number,
): Promise<RecordedMigration[]> {
  const recorded: RecordedMigration[] = [];

  for (const [index, migration] of added.entries()) {
    recorder.statements.length = 0;

    // oxlint-disable-next-line no-await-in-loop -- each migration builds on the one before it
    await recorder.db.transaction().execute((tx) => migration.up(tx));
    recorded.push({
      version: releasedCount + index + 1,
      name: migration.name,
      statements: [...recorder.statements],
    });
  }
  return recorded;
}

// A new table, a new column, which SQLite gives a default or null, or an index: the release before
// reads and writes around each of them.
const expandStatements = [
  /^create table /u,
  /^create (?:unique )?index /u,
  /^alter table \S+ add (?:column )?/u,
];

function isExpandStatement(statement: string): boolean {
  const normalized = statement.trim().replaceAll(/\s+/gu, ' ').toLowerCase();

  return expandStatements.some((pattern) => pattern.test(normalized));
}
