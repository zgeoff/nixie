import { expect, test } from 'bun:test';
import { createEnrolmentCode } from './create-enrolment-code';
import { startTestAPI } from './test-utils/start-test-api';
import type { APITables } from './types';

function setupTest() {
  return startTestAPI();
}

test('it issues a code that lapses in 15 minutes', async () => {
  const ctx = await setupTest();

  const result = await createEnrolmentCode(ctx.context);

  expect(result.code).toMatch(/^[0-9A-Z]{5}-[0-9A-Z]{5}$/u);
  expect(result.expiresAt).toStrictEqual(new Date(1_000_000 + 15 * 60 * 1000));
});

test('it records the code as issued by the host, without the code', async () => {
  const ctx = await setupTest();

  const issued = await createEnrolmentCode(ctx.context);
  const record = await ctx.writer.db
    .$extendTables<APITables & { records: { kind: string; payload: string } }>()
    .selectFrom('records')
    .select('payload')
    .where('kind', '=', 'enrolment_code.issued')
    .executeTakeFirstOrThrow();

  expect(JSON.parse(record.payload)).toStrictEqual({
    issuedBy: null,
    expiresAt: issued.expiresAt.getTime(),
  });
});
