import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Kysely, sql } from 'kysely';
import { buildSqliteWorkerDialect } from './build-sqlite-worker-dialect';
import { nixieSchema } from './nixie-schema';
import { runMigrations } from './run-migrations';
import { webFetchLinksMigration } from './web-fetch-links-migration';

async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const directory = await mkdtemp(join(tmpdir(), 'nixie-web-fetch-links-'));

  stack.defer(() => rm(directory, { recursive: true, force: true }));

  const db = new Kysely<unknown>({
    dialect: buildSqliteWorkerDialect(join(directory, 'nixie.db')),
  });

  stack.defer(() => db.destroy());

  // the schema the release before leaves, which the migration starts from
  await runMigrations(db, {
    schema: {
      migrations: nixieSchema.migrations.slice(
        0,
        nixieSchema.migrations.indexOf(webFetchLinksMigration),
      ),
      oldestReader: 0,
    },
    copyDir: directory,
  });

  return { db, directory };
}

test('it moves the schema to version 22', () => {
  expect(nixieSchema.migrations.indexOf(webFetchLinksMigration) + 1).toBe(22);
});

test('it keeps the rows of a database it upgrades, and stores a link', async () => {
  const ctx = await setupTest();

  await sql`insert into skill_versions (skill_hash, name, frontmatter, files)
    values ('skill-a', 'tide-tables', '{}', '{"SKILL.md":"# Tides"}')`.execute(ctx.db);

  await runMigrations(ctx.db, { schema: nixieSchema, copyDir: ctx.directory });

  await sql`insert into web_fetch_links (session_key, number, url, thread)
    values ('session-a', 1, 'https://harbour.test/ferries', 'conversation')`.execute(ctx.db);

  const skills = await sql`select skill_hash from skill_versions`.execute(ctx.db);
  const links = await sql`select * from web_fetch_links`.execute(ctx.db);

  expect(skills.rows).toStrictEqual([{ skill_hash: 'skill-a' }]);

  expect(links.rows).toStrictEqual([
    {
      session_key: 'session-a',
      number: 1,
      url: 'https://harbour.test/ferries',
      thread: 'conversation',
    },
  ]);
});

test('it keeps each link when it runs again', async () => {
  const ctx = await setupTest();

  await runMigrations(ctx.db, { schema: nixieSchema, copyDir: ctx.directory });

  await sql`insert into web_fetch_links (session_key, number, url, thread)
    values ('session-a', 1, 'https://harbour.test/ferries', 'conversation')`.execute(ctx.db);

  await ctx.db.transaction().execute((tx) => webFetchLinksMigration.up(tx));

  const links = await sql`select number, url from web_fetch_links`.execute(ctx.db);

  expect(links.rows).toStrictEqual([{ number: 1, url: 'https://harbour.test/ferries' }]);
});

test('it refuses a second number for one URL in a session', async () => {
  const ctx = await setupTest();

  await runMigrations(ctx.db, { schema: nixieSchema, copyDir: ctx.directory });

  await sql`insert into web_fetch_links (session_key, number, url, thread)
    values ('session-a', 1, 'https://harbour.test/ferries', 'conversation')`.execute(ctx.db);

  const refused = await sql`insert into web_fetch_links (session_key, number, url, thread)
    values ('session-a', 2, 'https://harbour.test/ferries', 'conversation')`
    .execute(ctx.db)
    .then(
      () => null,
      (error: unknown) => error,
    );

  expect(refused).toBeInstanceOf(Error);
});
