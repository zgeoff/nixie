import { expect, test } from 'bun:test';
import { within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import invariant from 'tiny-invariant';
import { store } from '../mocks/store';
import { createDeviceSession } from '../test-utils/create-device-session';
import { render } from '../test-utils/render';
import { Conversation } from './conversation';

async function setupTest() {
  await createDeviceSession();

  return { user: userEvent.setup() };
}

test('it undoes one item of a 3-item notice under the reply, and keeps the other 2', async () => {
  const ctx = await setupTest();

  const message = await store.records.create({
    kind: 'owner_message',
    message: { text: 'I run on Sundays, I keep a kettlebell, and I hate cilantro' },
  });

  await store.records.create({ kind: 'model.reply', message: { text: 'Noted, all three.' } });

  const runs = await store.memoryItems.create({ shortID: 'r7k2pa', versions: [{ text: 'Runs on Sundays' }] });
  const bell = await store.memoryItems.create({ shortID: 'b4n8wq', versions: [{ text: 'Owns a kettlebell' }] });
  const herb = await store.memoryItems.create({ shortID: 'h2c5xe', versions: [{ text: 'Hates cilantro' }] });

  await store.memoryNotices.create({
    entries: [
      { itemID: runs.itemID, sequence: message.sequence + 1 },
      { itemID: bell.itemID, sequence: message.sequence + 2 },
      { itemID: herb.itemID, sequence: message.sequence + 3 },
    ],
    kind: 'turn',
    messageSequence: message.sequence,
    noticeKey: `turn/conversation/${String(message.sequence)}`,
  });

  const rendered = render(<Conversation thread="conversation" />);

  const notice = await rendered.findByRole('listitem', { name: 'Remembered 3 things' });

  await ctx.user.click(within(notice).getByRole('button', { name: 'View' }));

  const changes = within(notice).getByRole('list', { name: 'Memory changes' });

  await ctx.user.click(
    within(within(changes).getByRole('listitem', { name: 'b4n8wq' })).getByRole('button', {
      name: 'Undo',
    }),
  );

  await within(within(changes).getByRole('listitem', { name: 'b4n8wq' })).findByText('Undone');

  const stored = store.memoryItems.all();

  expect(stored.find((item) => item.itemID === bell.itemID)).toMatchObject({
    state: 'retired',
    versions: [{ change: 'created' }, { change: 'undone', origin: 'owner', state: 'retired' }],
  });

  expect(stored.find((item) => item.itemID === runs.itemID)?.versions).toHaveLength(1);
  expect(stored.find((item) => item.itemID === herb.itemID)?.versions).toHaveLength(1);

  expect(
    within(within(changes).getByRole('listitem', { name: 'r7k2pa' })).getByRole('button', {
      name: 'Undo',
    }),
  ).toBeEnabled();

  expect(
    within(within(changes).getByRole('listitem', { name: 'h2c5xe' })).getByRole('button', {
      name: 'Undo',
    }),
  ).toBeEnabled();
});

test("it places a turn's notice under the turn's reply", async () => {
  await setupTest();

  const message = await store.records.create({
    kind: 'owner_message',
    message: { text: 'I run on Sundays' },
  });

  await store.records.create({ kind: 'model.reply', message: { text: 'Noted.' } });
  await store.records.create({ kind: 'owner_message', message: { text: 'What next?' } });

  const runs = await store.memoryItems.create({ versions: [{ text: 'Runs on Sundays' }] });

  await store.memoryNotices.create({
    entries: [{ itemID: runs.itemID, sequence: message.sequence + 1 }],
    kind: 'turn',
    messageSequence: message.sequence,
    noticeKey: `turn/conversation/${String(message.sequence)}`,
  });

  const rendered = render(<Conversation thread="conversation" />);

  await rendered.findByRole('listitem', { name: 'Remembered 1 thing' });

  expect(rendered.getByRole('list', { name: 'Conversation' })).toHaveTextContent(
    /You I run on Sundays.*nixie Noted\..*Remembered 1 thing · View.*You What next\?/u,
  );
});

test('it refuses an undo of an item that changed after the notice loaded, and changes nothing', async () => {
  const ctx = await setupTest();

  const message = await store.records.create({
    kind: 'owner_message',
    message: { text: 'I run on Sundays' },
  });

  await store.records.create({ kind: 'model.reply', message: { text: 'Noted.' } });

  const runs = await store.memoryItems.create({
    shortID: 'r7k2pa',
    versions: [{ text: 'Runs on Sundays' }],
  });

  await store.memoryNotices.create({
    entries: [{ itemID: runs.itemID, sequence: message.sequence + 1 }],
    kind: 'turn',
    messageSequence: message.sequence,
    noticeKey: `turn/conversation/${String(message.sequence)}`,
  });

  const rendered = render(<Conversation thread="conversation" />);

  const notice = await rendered.findByRole('listitem', { name: 'Remembered 1 thing' });

  await ctx.user.click(within(notice).getByRole('button', { name: 'View' }));

  await store.memoryItems.update((query) => query.where({ itemID: runs.itemID }), {
    data(draft) {
      const [first] = draft.versions;

      invariant(first);

      draft.versions.push({ ...first, change: 'edited', text: 'Runs on Saturdays' });
    },
  });

  await ctx.user.click(within(notice).getByRole('button', { name: 'Undo' }));

  const alert = await within(notice).findByRole('alert');

  expect(alert).toHaveTextContent('Nothing changed: this item changed after the notice.');

  expect(
    store.memoryItems.findFirst((query) => query.where({ itemID: runs.itemID }))?.versions,
  ).toMatchObject([{ change: 'created' }, { change: 'edited' }]);
});

test('it retires an item in one tap from the notice', async () => {
  const ctx = await setupTest();

  const message = await store.records.create({
    kind: 'owner_message',
    message: { text: 'I run on Sundays' },
  });

  await store.records.create({ kind: 'model.reply', message: { text: 'Noted.' } });

  const runs = await store.memoryItems.create({ versions: [{ text: 'Runs on Sundays' }] });

  await store.memoryNotices.create({
    entries: [{ itemID: runs.itemID, sequence: message.sequence + 1 }],
    kind: 'turn',
    messageSequence: message.sequence,
    noticeKey: `turn/conversation/${String(message.sequence)}`,
  });

  const rendered = render(<Conversation thread="conversation" />);

  const notice = await rendered.findByRole('listitem', { name: 'Remembered 1 thing' });

  await ctx.user.click(within(notice).getByRole('button', { name: 'View' }));
  await ctx.user.click(within(notice).getByRole('button', { name: 'Retire' }));

  await within(notice).findByText('Retired');

  expect(
    store.memoryItems.findFirst((query) => query.where({ itemID: runs.itemID })),
  ).toMatchObject({
    state: 'retired',
    versions: [{ change: 'created' }, { change: 'retired', origin: 'owner', state: 'retired' }],
  });
});

test('it keeps an item in one tap from the notice, and changes nothing', async () => {
  const ctx = await setupTest();

  const message = await store.records.create({
    kind: 'owner_message',
    message: { text: 'I run on Sundays' },
  });

  await store.records.create({ kind: 'model.reply', message: { text: 'Noted.' } });

  const runs = await store.memoryItems.create({ versions: [{ text: 'Runs on Sundays' }] });

  await store.memoryNotices.create({
    entries: [{ itemID: runs.itemID, sequence: message.sequence + 1 }],
    kind: 'turn',
    messageSequence: message.sequence,
    noticeKey: `turn/conversation/${String(message.sequence)}`,
  });

  const rendered = render(<Conversation thread="conversation" />);

  const notice = await rendered.findByRole('listitem', { name: 'Remembered 1 thing' });

  await ctx.user.click(within(notice).getByRole('button', { name: 'View' }));
  await ctx.user.click(within(notice).getByRole('button', { name: 'Keep' }));

  await within(notice).findByText('Kept');

  expect(
    store.memoryItems.findFirst((query) => query.where({ itemID: runs.itemID }))?.versions,
  ).toHaveLength(1);
});

test('it links each item to the memory view', async () => {
  const ctx = await setupTest();

  const message = await store.records.create({
    kind: 'owner_message',
    message: { text: 'I run on Sundays' },
  });

  await store.records.create({ kind: 'model.reply', message: { text: 'Noted.' } });

  const runs = await store.memoryItems.create({ versions: [{ text: 'Runs on Sundays' }] });

  await store.memoryNotices.create({
    entries: [{ itemID: runs.itemID, sequence: message.sequence + 1 }],
    kind: 'turn',
    messageSequence: message.sequence,
    noticeKey: `turn/conversation/${String(message.sequence)}`,
  });

  const rendered = render(<Conversation thread="conversation" />);

  const notice = await rendered.findByRole('listitem', { name: 'Remembered 1 thing' });

  await ctx.user.click(within(notice).getByRole('button', { name: 'View' }));

  expect(within(notice).getByRole('link', { name: 'Open in memory' })).toHaveAttribute(
    'href',
    `/memory?item=${runs.itemID}`,
  );
});

test("it shows a batch's writes as a quiet notice from earlier conversation", async () => {
  await setupTest();

  const message = await store.records.create({
    kind: 'owner_message',
    message: { text: 'I run on Sundays' },
  });

  await store.records.create({ kind: 'model.reply', message: { text: 'Noted.' } });

  const runs = await store.memoryItems.create({ versions: [{ text: 'Runs on Sundays' }] });

  await store.memoryNotices.create({
    entries: [{ itemID: runs.itemID, sequence: message.sequence + 2 }],
    kind: 'batch',
  });

  const rendered = render(<Conversation thread="conversation" />);

  const notice = await rendered.findByRole('listitem', {
    name: 'Remembered 1 thing from earlier conversation',
  });

  expect(notice).toHaveTextContent('Remembered 1 thing from earlier conversation · View');
});

test('it sends a proposal in a notice to the proposals page', async () => {
  const ctx = await setupTest();

  const message = await store.records.create({
    kind: 'owner_message',
    message: { text: 'I might like jazz' },
  });

  await store.records.create({ kind: 'model.reply', message: { text: 'I will ask first.' } });

  await store.memoryNotices.create({
    entries: [
      {
        change: 'proposed',
        itemID: 'b0f1c2d3-4e5f-4a6b-8c7d-9e0f1a2b3c4d',
        proposalID: 'proposal-a',
        sequence: message.sequence + 1,
        version: null,
      },
    ],
    kind: 'turn',
    messageSequence: message.sequence,
    noticeKey: `turn/conversation/${String(message.sequence)}`,
  });

  const rendered = render(<Conversation thread="conversation" />);

  const notice = await rendered.findByRole('listitem', { name: 'Proposed 1 thing' });

  await ctx.user.click(within(notice).getByRole('button', { name: 'View' }));

  expect(within(notice).getByRole('link', { name: 'Review' })).toHaveAttribute(
    'href',
    '/memory/proposals',
  );
});
