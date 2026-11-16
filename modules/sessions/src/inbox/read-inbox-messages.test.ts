import { expect, test } from 'bun:test';
import { writeRecords } from '@heynixie/log';
import { buildMockTaskMessageView } from '../test-utils/build-mock-task-message-view';
import { startTestTasks } from '../test-utils/start-test-tasks';
import { readInboxMessages } from './read-inbox-messages';

async function setupTest() {
  const tasks = await startTestTasks();

  return {
    log: tasks.context.log,
    context: tasks.context,
    addVersion: tasks.definitionStore.add,
    buildFirePayload: (overrides: Record<string, unknown>) => ({
      definitionID: 'call-the-dentist',
      definitionHash: 'hash-1',
      source: 'at',
      dedupeKey: 'key-1',
      kind: 'at',
      scheduledFor: '2027-03-09T03:00:00.000Z',
      firedAt: '2027-03-09T03:00:00.000Z',
      isCatchUp: false,
      skipped: [],
      skippedCount: 0,
      ...overrides,
    }),
  };
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

  const messages = await readInboxMessages(ctx.context, records, {
    times: { defaultZone: 'Australia/Sydney', now: new Date('2026-10-13T05:00:00Z') },
    view: buildMockTaskMessageView(),
    imageBudget: { bytes: 1024, count: 100 },
  });

  expect(messages).toStrictEqual([
    {
      uuid: expect.toBeString(),
      text: expect.toInclude('Two shelf layouts.'),
      images: [
        { marker: expect.toInclude('n="1"'), mediaType: 'image/png', data: 'iVBORw==' },
        { marker: expect.toInclude('n="2"'), mediaType: 'image/jpeg', data: '/9g=' },
      ],
    },
    { uuid: expect.toBeString(), text: expect.toInclude('No pictures this time.') },
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

  const messages = await readInboxMessages(ctx.context, records, {
    times: { defaultZone: 'Australia/Sydney', now: new Date('2026-10-13T05:00:00Z') },
    view: buildMockTaskMessageView(),
    imageBudget: { bytes: 12, count: 100 },
  });

  expect(messages.map((message) => message.text)).toStrictEqual([
    expect.toInclude('The first plan.'),
  ]);
});

test('it stops before the record whose images would pass the count, however few their bytes', async () => {
  const ctx = await setupTest();

  const records = await writeRecords(ctx.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      payload: { images: [{ mediaType: 'image/png' }, { mediaType: 'image/png' }] },
      erasable: { text: 'The first two plans.' },
      attachments: [new Uint8Array(6).fill(1), new Uint8Array(6).fill(2)],
    },
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      payload: { images: [{ mediaType: 'image/png' }] },
      erasable: { text: 'The third plan.' },
      attachments: [new Uint8Array(6).fill(3)],
    },
  ]);

  const messages = await readInboxMessages(ctx.context, records, {
    times: { defaultZone: 'Australia/Sydney', now: new Date('2026-10-13T05:00:00Z') },
    view: buildMockTaskMessageView(),
    imageBudget: { bytes: 1024, count: 2 },
  });

  expect(messages.map((message) => message.text)).toStrictEqual([
    expect.toInclude('The first two plans.'),
  ]);
});

test('it reads a record with no images past a budget the images before it spent', async () => {
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
      erasable: { text: 'What do you think?' },
    },
  ]);

  const messages = await readInboxMessages(ctx.context, records, {
    times: { defaultZone: 'Australia/Sydney', now: new Date('2026-10-13T05:00:00Z') },
    view: buildMockTaskMessageView(),
    imageBudget: { bytes: 4, count: 100 },
  });

  expect(messages.map((message) => message.text)).toStrictEqual([
    expect.toInclude('The first plan.'),
    expect.toInclude('What do you think?'),
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

  const messages = await readInboxMessages(ctx.context, records, {
    times: { defaultZone: 'Australia/Sydney', now: new Date('2026-10-13T05:00:00Z') },
    view: buildMockTaskMessageView(),
    imageBudget: { bytes: 0, count: 0 },
  });

  expect(messages).toHaveLength(1);
});

test('it passes over a record of a kind no module registers and keeps the records around it', async () => {
  const ctx = await setupTest();

  const records = await writeRecords(ctx.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'Before.' },
    },
    {
      // @ts-expect-error -- no module registers this kind
      kind: 'harbour.unknown_kind',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      payload: { tide: 'high' },
    },
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'After.' },
    },
  ]);

  const messages = await readInboxMessages(ctx.context, records, {
    times: { defaultZone: 'Australia/Sydney', now: new Date('2026-10-13T05:00:00Z') },
    view: buildMockTaskMessageView(),
    imageBudget: { bytes: 1024, count: 100 },
  });

  expect(messages.map((message) => message.text)).toStrictEqual([
    expect.stringContaining('Before.'),
    expect.stringContaining('After.'),
  ]);
});

test.each([
  ['the brief of the pinned version', 'hash-1', 'Call the dentist about the crown.'],
  ['a note for a version that is no longer stored', 'hash-gone', 'no longer stored'],
])(
  'it reads a fire on the conversation thread as a reminder with %s',
  async (_name, hash, text) => {
    const ctx = await setupTest();

    ctx.addVersion('hash-1', {
      version: {
        brief: 'Call the dentist about the crown.',
        trigger: { at: '2027-03-09T14:00:00+11:00' },
      },
    });

    const records = await writeRecords(ctx.log, [
      {
        kind: 'trigger.fired',
        definitions: { snapshotHash: 'sha256:test' },
        thread: 'conversation',
        payload: ctx.buildFirePayload({ definitionHash: hash }),
      },
    ]);

    const messages = await readInboxMessages(ctx.context, records, {
      times: { defaultZone: 'Australia/Sydney', now: new Date('2027-03-09T03:30:00Z') },
      view: buildMockTaskMessageView(),
      imageBudget: { bytes: 1024, count: 100 },
    });

    expect(messages).toStrictEqual([
      {
        uuid: expect.toBeString(),
        text: expect.stringContaining(`type="reminder"`),
      },
    ]);

    expect(messages[0]?.text).toInclude(text);
    expect(messages[0]?.text).toInclude('It was set for Tue 9 Mar, 14:00, Sydney.');
  },
);

test.each([
  ['a fire on the thread of a task', 'water-the-tomatoes', {}],
  ['a poll fire on the conversation thread', 'conversation', { kind: 'poll', polled: [1] }],
  ['a fire of an unknown kind', 'conversation', { kind: 'webhook' }],
])('it keeps the fallback line for %s', async (_name, thread, overrides) => {
  const ctx = await setupTest();

  const records = await writeRecords(ctx.log, [
    {
      kind: 'trigger.fired',
      definitions: { snapshotHash: 'sha256:test' },
      thread,
      payload: ctx.buildFirePayload(overrides),
    },
  ]);

  const messages = await readInboxMessages(ctx.context, records, {
    times: { defaultZone: 'Australia/Sydney', now: new Date('2027-03-09T03:30:00Z') },
    view: buildMockTaskMessageView(),
    imageBudget: { bytes: 1024, count: 100 },
  });

  expect(messages[0]?.text).toStartWith('A trigger.fired record arrived:');
});
