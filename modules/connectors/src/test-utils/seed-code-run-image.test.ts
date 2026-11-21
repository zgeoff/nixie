import { expect, test } from 'bun:test';
import { seedCodeRunImage } from './seed-code-run-image';
import { startTestLog } from './start-test-log';

test('it returns the file ID of the picture the code run wrote', async () => {
  const log = await startTestLog();

  const seeded = await seedCodeRunImage(log, {
    thread: 'conversation',
    width: 8,
    height: 6,
    format: 'png',
  });

  expect(seeded.file).toMatch(/^[a-z0-9]{10}$/u);
});
