import { expect, test } from 'bun:test';
import type { ToolRun } from '@heynixie/tools';
import { startTestLog } from '../test-utils/start-test-log';
import { readLinkTarget } from './read-link-target';
import { writeLinkTags } from './write-link-tags';

async function setupTest() {
  const log = await startTestLog();

  const run: ToolRun = {
    runID: 'run-1',
    thread: 'conversation',
    logThread: 'conversation',
    tools: [],
    model: { model: 'm', profile: 'p' },
    session: { key: 'session-a', invalidatedThrough: 0 },
  };

  return { log, run };
}

test('#writeLinkTags tags each URL with a number of the session and its host', async () => {
  const ctx = await setupTest();

  const tags = await writeLinkTags(ctx.log, ctx.run, {
    urls: ['https://pier.test/reset?token=abc', 'https://pier.test/'],
    linkPathChars: 24,
  });

  const entries = tags === null ? null : [...tags];

  expect(entries).toStrictEqual([
    ['https://pier.test/reset?token=abc', '[L1 · pier.test/reset]'],
    ['https://pier.test/', '[L2 · pier.test]'],
  ]);
});

test('#writeLinkTags stores each target where web_fetch reads a link of the session', async () => {
  const ctx = await setupTest();

  await writeLinkTags(ctx.log, ctx.run, {
    urls: ['https://pier.test/reset?token=abc'],
    linkPathChars: 24,
  });

  const target = await readLinkTarget(ctx.log, { sessionKey: 'session-a', number: 1 });

  expect(target).toBe('https://pier.test/reset?token=abc');
});
