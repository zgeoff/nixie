import { expect, test } from 'bun:test';
import { readLinkTarget } from './read-link-target';
import { startTestLog } from './test-utils/start-test-log';
import { writeLinkNumbers } from './write-link-numbers';

async function setupTest() {
  return { log: await startTestLog() };
}

test('it reads the target of the link the session numbered', async () => {
  const ctx = await setupTest();

  await writeLinkNumbers(ctx.log, {
    sessionKey: 'session-a',
    thread: 'conversation',
    invalidatedThrough: null,
    urls: ['https://pier.test/a', 'https://pier.test/b'],
  });

  const target = await readLinkTarget(ctx.log, { sessionKey: 'session-a', number: 2 });

  expect(target).toBe('https://pier.test/b');
});

test('it reads no target for a number another session gave', async () => {
  const ctx = await setupTest();

  await writeLinkNumbers(ctx.log, {
    sessionKey: 'session-a',
    thread: 'conversation',
    invalidatedThrough: null,
    urls: ['https://pier.test/a'],
  });

  const target = await readLinkTarget(ctx.log, { sessionKey: 'session-b', number: 1 });

  expect(target).toBeNull();
});

test('it reads no target for a number past the session count', async () => {
  const ctx = await setupTest();

  await writeLinkNumbers(ctx.log, {
    sessionKey: 'session-a',
    thread: 'conversation',
    invalidatedThrough: null,
    urls: ['https://pier.test/a'],
  });

  const target = await readLinkTarget(ctx.log, { sessionKey: 'session-a', number: 2 });

  expect(target).toBeNull();
});
