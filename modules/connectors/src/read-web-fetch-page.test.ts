import { expect, test } from 'bun:test';
import invariant from 'tiny-invariant';
import { readWebFetchPage } from './read-web-fetch-page';
import { startTestLog } from './test-utils/start-test-log';
import { writeWebFetchPage } from './write-web-fetch-page';

async function setupTest() {
  return { log: await startTestLog() };
}

test('it reads the parts of a page the session stored', async () => {
  const ctx = await setupTest();

  const stored = await writeWebFetchPage(
    ctx.log,
    {
      url: 'https://harbour.test/ferries',
      status: 200,
      contentType: 'text/plain',
      isTruncated: false,
      blocked: null,
      text: 'Ferries leave at nine.',
      links: [],
    },
    { sessionKey: 'session-a', thread: 'conversation', invalidatedThrough: null },
    { textBytes: 100, linkPathChars: 24, storeBytes: 1000 },
  );

  invariant(stored);

  const page = await readWebFetchPage(ctx.log, { sessionKey: 'session-a', pageID: stored.pageID });

  expect(page?.parts).toStrictEqual(['Ferries leave at nine.']);
});

test('it reads no page for the ID of a page another session stored', async () => {
  const ctx = await setupTest();

  const stored = await writeWebFetchPage(
    ctx.log,
    {
      url: 'https://harbour.test/ferries',
      status: 200,
      contentType: 'text/plain',
      isTruncated: false,
      blocked: null,
      text: 'Ferries leave at nine.',
      links: [],
    },
    { sessionKey: 'session-a', thread: 'task-tides', invalidatedThrough: null },
    { textBytes: 100, linkPathChars: 24, storeBytes: 1000 },
  );

  invariant(stored);

  const page = await readWebFetchPage(ctx.log, { sessionKey: 'session-b', pageID: stored.pageID });

  expect(page).toBeNull();
});

test('it reads no page for an ID no session stored', async () => {
  const ctx = await setupTest();
  const page = await readWebFetchPage(ctx.log, { sessionKey: 'session-a', pageID: 'qx7f2m9kpa' });

  expect(page).toBeNull();
});
