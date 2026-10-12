import { expect, test } from 'bun:test';
import { startTestAPI } from './test-utils/start-test-api';
import { writeRefusal } from './write-refusal';

function setupTest() {
  return startTestAPI();
}

test('it writes a refusal for an external ID it has not refused before', async () => {
  const ctx = await setupTest();

  const result = await writeRefusal(ctx.context, { channel: 'client', externalID: 'ab12' });

  expect(result).toBeTrue();
});

test('it writes no second refusal for the same external ID within the hour', async () => {
  const ctx = await setupTest();

  await writeRefusal(ctx.context, { channel: 'client', externalID: 'ab12' });
  ctx.clock.advance(60 * 60 * 1000 - 1);

  const result = await writeRefusal(ctx.context, { channel: 'client', externalID: 'ab12' });

  expect(result).toBeFalse();
});

test('it writes a refusal for the same external ID on another channel', async () => {
  const ctx = await setupTest();

  await writeRefusal(ctx.context, { channel: 'client', externalID: 'ab12' });

  const result = await writeRefusal(ctx.context, { channel: 'telegram', externalID: 'ab12' });

  expect(result).toBeTrue();
});
