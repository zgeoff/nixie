import { expect, test } from 'bun:test';
import { readRecordAttachments, readRecords } from '@heynixie/log';
import { seedScreenClickCard } from './seed-screen-click-card';
import { startTestAPI } from './start-test-api';

function setupTest() {
  return startTestAPI();
}

test('it seeds the call of a screen click with its picture, and a proposal that names the call', async () => {
  const ctx = await setupTest();

  const picture = new Uint8Array([137, 80, 78, 71]);

  const seeded = await seedScreenClickCard(ctx.context, picture);
  const entries = await readRecords(ctx.context.log, { afterSequence: 0 });
  const attached = await readRecordAttachments(ctx.context.log, [seeded.callSequence]);

  expect(entries.map((entry) => entry.record.kind)).toStrictEqual([
    'tool_called',
    'policy.action_proposed',
  ]);

  expect(attached.get(seeded.callSequence)).toStrictEqual({
    status: 'readable',
    attachments: [picture],
  });
});
