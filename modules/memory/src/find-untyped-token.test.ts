import { expect, test } from 'bun:test';
import { findUntypedToken } from './find-untyped-token';
import { startTestMemory } from './test-utils/start-test-memory';
import { writeOwnerMessageRecord } from './test-utils/write-owner-message-record';

async function setupTest() {
  return { memory: await startTestMemory() };
}

test('it passes a token you typed on the thread', async () => {
  const ctx = await setupTest();

  await writeOwnerMessageRecord(ctx.memory.log, {
    thread: 'conversation',
    text: 'Send the tide report to sam@example.com',
    spans: [{ start: 0, end: 39, source: 'typed' }],
  });

  const token = await findUntypedToken(ctx.memory.log, {
    thread: 'conversation',
    limit: 20,
    text: 'Email the report to sam@example.com.',
    ownText: '',
  });

  expect(token).toBeNull();
});

test('it passes a token that your own text holds', async () => {
  const ctx = await setupTest();

  const token = await findUntypedToken(ctx.memory.log, {
    thread: 'conversation',
    limit: 20,
    text: 'Read the tables at https://tides.example.org/ports.',
    ownText: 'The tables live at https://tides.example.org/ports.',
  });

  expect(token).toBeNull();
});

test('it finds a token you only pasted', async () => {
  const ctx = await setupTest();

  await writeOwnerMessageRecord(ctx.memory.log, {
    thread: 'conversation',
    text: 'Send the tide report to sam@example.com',
    spans: [
      { start: 0, end: 24, source: 'typed' },
      { start: 24, end: 39, source: 'pasted' },
    ],
  });

  const token = await findUntypedToken(ctx.memory.log, {
    thread: 'conversation',
    limit: 20,
    text: 'Email the report to sam@example.com.',
    ownText: '',
  });

  expect(token).toStrictEqual({ kind: 'email', key: 'sam@example.com', raw: 'sam@example.com' });
});

test('it finds a token you typed only on another thread', async () => {
  const ctx = await setupTest();

  await writeOwnerMessageRecord(ctx.memory.log, {
    thread: 'task-a',
    text: 'Send the tide report to sam@example.com',
    spans: [{ start: 0, end: 39, source: 'typed' }],
  });

  const token = await findUntypedToken(ctx.memory.log, {
    thread: 'conversation',
    limit: 20,
    text: 'Email the report to sam@example.com.',
    ownText: '',
  });

  expect(token).toStrictEqual({ kind: 'email', key: 'sam@example.com', raw: 'sam@example.com' });
});
