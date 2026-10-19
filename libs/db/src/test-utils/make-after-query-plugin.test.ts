import { expect, mock, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sql } from 'kysely';
import { startDatabase } from '../start-database';
import { makeAfterQueryPlugin } from './make-after-query-plugin';

async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const dir = await mkdtemp(join(tmpdir(), 'nixie-after-query-'));

  stack.defer(() => rm(dir, { recursive: true, force: true }));

  const db = startDatabase(join(dir, 'nixie.db'));

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

  const db = ctx.db.withPlugin(makeAfterQueryPlugin(2, action));

  for (const value of [1, 2, 3]) {
    const result = await sql<{ value: number }>`select ${value} as value`.execute(db);

    seen.push(`query ${String(result.rows[0]?.value)}`);
  }

  expect(seen).toStrictEqual(['query 1', 'action', 'query 2', 'query 3']);
  expect(action).toHaveBeenCalledOnce();
});
