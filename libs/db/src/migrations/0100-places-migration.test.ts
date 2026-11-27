import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Kysely, sql } from 'kysely';
import { z } from 'zod';
import { buildShortIDFromUUID } from '../build-short-id-from-uuid';
import { runMigrations } from '../migration/run-migrations';
import { readQueryRows } from '../read-query-rows';
import { nixieSchema } from '../schema/nixie-schema';
import { SchemaTooNewError } from '../schema/schema-too-new-error';
import { buildSqliteWorkerDialect } from '../sqlite/build-sqlite-worker-dialect';
import { readRunPrefix } from '../test-utils/read-run-prefix';
import { placesMigration } from './0100-places-migration';

async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const prefix = await readRunPrefix();
  const directory = await mkdtemp(join(tmpdir(), `${prefix}nixie-places-migration-`));

  stack.defer(() => rm(directory, { recursive: true, force: true }));

  const db = new Kysely<unknown>({
    dialect: buildSqliteWorkerDialect(join(directory, 'nixie.db')),
  });

  stack.defer(() => db.destroy());

  return {
    db,
    upgrade: () => runMigrations(db, { schema: nixieSchema, copyDir: directory }),
    startPreviousRelease: () =>
      runMigrations(db, {
        schema: { migrations: nixieSchema.migrations.slice(0, 98), oldestReader: 0 },
        copyDir: directory,
      }),
    readPlaces: () =>
      readQueryRows(
        sql`select place_id, short_id, origin, kind, trust, added_by, added_sequence,
          removed_sequence from places order by added_sequence`,
        db,
        z.object({
          place_id: z.string(),
          short_id: z.string(),
          origin: z.string(),
          kind: z.string(),
          trust: z.string(),
          added_by: z.string(),
          added_sequence: z.number(),
          removed_sequence: z.number().nullable(),
        }),
      ),
  };
}

test('it registers as migration 99, which the release before cannot read', () => {
  expect(nixieSchema.migrations.indexOf(placesMigration) + 1).toBe(99);
  expect(nixieSchema.oldestReader).toBeGreaterThanOrEqual(99);
});

test('it refuses to open the upgraded database to the release before it', async () => {
  const ctx = await setupTest();

  await ctx.upgrade();

  const run = ctx.startPreviousRelease();

  await Promise.allSettled([run]);

  expect(run).rejects.toBeInstanceOf(SchemaTooNewError);
});

test('it folds a known contact into a place at known, keeping its marked and unmarked sequences', async () => {
  const ctx = await setupTest();

  const contactID = crypto.randomUUID();

  await sql`create table known_contacts (
    contact_id text primary key,
    marked_sequence integer not null,
    unmarked_sequence integer
  ) strict`.execute(ctx.db);

  await sql`insert into known_contacts values (${contactID}, 7, 9)`.execute(ctx.db);
  await ctx.db.transaction().execute((tx) => placesMigration.up(tx));

  const rows = await ctx.readPlaces();

  expect(rows).toStrictEqual([
    {
      place_id: contactID,
      short_id: buildShortIDFromUUID(contactID),
      origin: 'contact',
      kind: 'contact',
      trust: 'known',
      added_by: 'you',
      added_sequence: 7,
      removed_sequence: 9,
    },
  ]);
});
