import { expect, test } from 'bun:test';
import { readLinkTarget } from '../read-link-target';
import { seedWebFetchLinks } from './seed-web-fetch-links';
import { startTestLog } from './start-test-log';

async function setupTest() {
  return { log: await startTestLog() };
}

test("it numbers the seeded URLs in the session's order", async () => {
  const ctx = await setupTest();

  await seedWebFetchLinks(ctx.log, {
    sessionKey: 'session-quay',
    thread: 'conversation',
    urls: ['https://quay.test/a', 'https://quay.test/b'],
  });

  const target = await readLinkTarget(ctx.log, { sessionKey: 'session-quay', number: 2 });

  expect(target).toBe('https://quay.test/b');
});
