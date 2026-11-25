import { expect, test } from 'bun:test';
import type { ToolRun } from '@heynixie/tools';
import { formatLinkMark } from '@heynixie/wire';
import { startTestLog } from '../test-utils/start-test-log';
import { readLinkTarget } from './read-link-target';
import { writeLinkedText } from './write-linked-text';

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

test('#writeLinkedText replaces each mark with the tag of its link and keeps no address', async () => {
  const ctx = await setupTest();

  const text = await writeLinkedText(ctx.log, ctx.run, {
    text: `Tap Reset password ${formatLinkMark(0)}.`,
    links: ['https://pier.test/reset?token=abc'],
    textBytes: 1000,
    linkPathChars: 24,
  });

  expect(text).toBe('Tap Reset password [L1 · pier.test/reset].');
});

test('#writeLinkedText stores each target where web_fetch reads a link of the session', async () => {
  const ctx = await setupTest();

  await writeLinkedText(ctx.log, ctx.run, {
    text: `a ${formatLinkMark(0)}`,
    links: ['https://pier.test/reset?token=abc'],
    textBytes: 1000,
    linkPathChars: 24,
  });

  const target = await readLinkTarget(ctx.log, { sessionKey: 'session-a', number: 1 });

  expect(target).toBe('https://pier.test/reset?token=abc');
});
