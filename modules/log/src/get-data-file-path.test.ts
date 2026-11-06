import { expect, onTestFinished, test } from 'bun:test';
import { join } from 'node:path';
import { readQueryRows, startDatabase } from '@heynixie/db';
import { sql } from 'kysely';
import { z } from 'zod';
import { getDataFilePath } from './get-data-file-path';
import { startTestLog } from './test-utils/start-test-log';

function setupTest() {
  return startTestLog();
}

test.each([
  ['nixie.db', 'records', 'record_keys'],
  ['keys.db', 'record_keys', 'records'],
] as const)(
  'it names the %s database that the writer creates, which holds %s and no %s',
  async (file, table, otherTable) => {
    const ctx = await setupTest();

    const path = getDataFilePath(ctx.dataDir, file);
    const db = startDatabase(path, { readonly: true });

    onTestFinished(() => db.destroy());

    const rows = await readQueryRows(
      sql`select name from sqlite_master where type = 'table'`,
      db,
      z.object({ name: z.string() }),
    );

    const names = rows.map((row) => row.name);

    expect(path).toBe(join(ctx.dataDir, file));
    expect(names).toContain(table);
    expect(names).not.toContain(otherTable);
  },
);
