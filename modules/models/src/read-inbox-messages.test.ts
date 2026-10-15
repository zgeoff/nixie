import { expect, test } from 'bun:test';
import { writeRecords } from '@heynixie/log';
import { readInboxMessages } from './read-inbox-messages';
import { startTestTasks } from './test-utils/start-test-tasks';

async function setupTest() {
  const tasks = await startTestTasks();

  return { log: tasks.context.log };
}

test('it reads each record with the images its attachments hold', async () => {
  const ctx = await setupTest();

  const records = await writeRecords(ctx.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      payload: { images: [{ mediaType: 'image/png' }, { mediaType: 'image/jpeg' }] },
      erasable: { text: 'Two shelf layouts.' },
      attachments: [new Uint8Array([0x89, 0x50, 0x4e, 0x47]), new Uint8Array([0xff, 0xd8])],
    },
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'No pictures this time.' },
    },
  ]);

  const messages = await readInboxMessages(ctx.log, records, {
    times: { defaultZone: 'Australia/Sydney', now: new Date('2026-10-13T05:00:00Z') },
    imageBudgetBytes: 1024,
  });

  expect(messages).toStrictEqual([
    {
      uuid: expect.toBeString(),
      text: expect.toEndWith('Two shelf layouts.'),
      images: [
        { marker: expect.toInclude('n="1"'), mediaType: 'image/png', data: 'iVBORw==' },
        { marker: expect.toInclude('n="2"'), mediaType: 'image/jpeg', data: '/9g=' },
      ],
    },
    { uuid: expect.toBeString(), text: expect.toEndWith('No pictures this time.') },
  ]);
});

test('it stops before the record whose images would pass the budget', async () => {
  const ctx = await setupTest();

  const records = await writeRecords(ctx.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      payload: { images: [{ mediaType: 'image/png' }] },
      erasable: { text: 'The first plan.' },
      attachments: [new Uint8Array(6).fill(1)],
    },
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      payload: { images: [{ mediaType: 'image/png' }] },
      erasable: { text: 'The second plan.' },
      attachments: [new Uint8Array(6).fill(2)],
    },
  ]);

  // 6 bytes read as 8 in base64, so the second image would bring the total to 16
  const messages = await readInboxMessages(ctx.log, records, {
    times: { defaultZone: 'Australia/Sydney', now: new Date('2026-10-13T05:00:00Z') },
    imageBudgetBytes: 12,
  });

  expect(messages.map((message) => message.text)).toStrictEqual([
    expect.toEndWith('The first plan.'),
  ]);
});

test('it reads the first record whatever its images, so a large message still reaches the model', async () => {
  const ctx = await setupTest();

  const records = await writeRecords(ctx.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      payload: { images: [{ mediaType: 'image/png' }] },
      erasable: { text: 'A large plan.' },
      attachments: [new Uint8Array(30).fill(1)],
    },
  ]);

  const messages = await readInboxMessages(ctx.log, records, {
    times: { defaultZone: 'Australia/Sydney', now: new Date('2026-10-13T05:00:00Z') },
    imageBudgetBytes: 0,
  });

  expect(messages).toHaveLength(1);
});
