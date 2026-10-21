import { expect, mock, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sql } from 'kysely';
import { z } from 'zod';
import { readQueryRows } from '../read-query-rows';
import { startDatabase } from '../start-database';
import { buildAfterQueryPlugin } from './build-after-query-plugin';

async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const directory = await mkdtemp(join(tmpdir(), 'nixie-after-query-'));

  stack.defer(() => rm(directory, { recursive: true, force: true }));

  const db = startDatabase(join(directory, 'nixie.db'));

  stack.defer(() => db.destroy());

  return { db };
}

test('it runs the action once, after the result of the query it names', async () => {
  const ctx = await setupTest();

  const seen: string[] = [];

  const action = mock(() => {
    seen.push('action');

    return Promise.resolve();
  });

  const db = ctx.db.withPlugin(buildAfterQueryPlugin(2, action));

  for (const value of [1, 2, 3]) {
    const [row] = await readQueryRows(
      sql`select ${value} as value`,
      db,
      z.object({ value: z.number() }),
    );

    seen.push(`query ${String(row?.value)}`);
  }

  expect(seen).toStrictEqual(['query 1', 'action', 'query 2', 'query 3']);
  expect(action).toHaveBeenCalledOnce();
});
