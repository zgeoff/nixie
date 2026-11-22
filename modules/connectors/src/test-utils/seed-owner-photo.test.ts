import { expect, test } from 'bun:test';
import { readRecordAttachments } from '@heynixie/log';
import { seedOwnerPhoto } from './seed-owner-photo';
import { startTestLog } from './start-test-log';

test('it writes an owner message whose attachment is a PNG of the size asked', async () => {
  const log = await startTestLog();
  const sequence = await seedOwnerPhoto(log, { thread: 'conversation', width: 8, height: 6 });
  const attachments = await readRecordAttachments(log, [sequence]);

  const stored = attachments.get(sequence);

  expect(stored?.status).toBe('readable');
});
