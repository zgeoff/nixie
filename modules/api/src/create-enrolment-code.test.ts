import { expect, test } from 'bun:test';
import { readRecords } from '@heynixie/log';
import { createEnrolmentCode } from './create-enrolment-code';
import { startTestAPI } from './test-utils/start-test-api';

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

  const records = await readRecords(ctx.context.log, {
    afterSequence: 0,
    kinds: ['enrolment_code.issued'],
  });

  expect(records.map((read) => read.record.payload)).toStrictEqual([
    { issuedBy: null, expiresAt: issued.expiresAt.getTime() },
  ]);
});
