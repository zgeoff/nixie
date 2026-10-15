import { expect, test } from 'bun:test';
import { createRecordKey } from './create-record-key';
import { findRecordKeys } from './find-record-keys';
import { startTestLog } from './test-utils/start-test-log';

async function setupTest() {
  const started = await startTestLog();

  return { log: started.log };
}

test('it writes a key under a fresh random ID that reads back from the key store', async () => {
  const ctx = await setupTest();
  const created = await createRecordKey(ctx.log);
  const keys = await findRecordKeys(ctx.log, [created.keyID]);

  expect(created.keyID).toBeString();
  expect(keys.get(created.keyID)).toBeInstanceOf(CryptoKey);
});

test('it writes a key under the ID the caller keys by', async () => {
  const ctx = await setupTest();
  const created = await createRecordKey(ctx.log, 'item-7f3e');
  const keys = await findRecordKeys(ctx.log, ['item-7f3e']);

  expect(created.keyID).toBe('item-7f3e');
  expect(keys.get('item-7f3e')).toBeInstanceOf(CryptoKey);
});
