import { expect, test } from 'bun:test';
import { waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { store } from '../mocks/store';
import { toLogRecord } from '../mocks/to-log-record';
import { writeMockForget } from '../mocks/write-mock-forget';
import { writeMockMemoryChange } from '../mocks/write-mock-memory-change';
import { createDeviceSession } from '../test-utils/create-device-session';
import { render } from '../test-utils/render';
import { MemoryProposals } from './memory-proposals';
import { RecordItem } from './record-item';

function setupTest() {
  return { user: userEvent.setup() };
}

test('it lists a pending proposal with why it waits for review, its quote inside its message, and when it lapses', async () => {
  await createDeviceSession();

  await store.memoryProposals.create({
    evidence: {
      end: 27,
      message: { status: 'readable', text: 'I think I will take up the oboe' },
      sequence: 4,
      start: 8,
    },
    lapseAt: new Date(2099, 2, 1),
    origin: 'conversation',
    quote: 'I will take up the oboe',
    reason: 'checker_unsure',
    source: 'untrusted',
    text: 'Takes up the oboe',
  });

  const rendered = render(<MemoryProposals />);

  const card = await rendered.findByRole('listitem', { name: 'Takes up the oboe' });

  expect(card).toHaveTextContent('The checker was unsure that your words state it.');

  expect(card).toHaveTextContent(
    `Proposed by the conversation, from outside content · lapses ${new Date(2099, 2, 1).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}`,
  );

  expect(card).toHaveTextContent(
    '“I will take up the oboe” from your message “I think I will take up the oboe”',
  );
});

test('it marks a self-note proposal with a self-note badge and why it waits for review', async () => {
  await createDeviceSession();

  await store.memoryProposals.create({
    subject: 'self',
    origin: 'conversation',
    reason: 'self_note',
    text: 'Enjoys a slow morning question',
  });

  const rendered = render(<MemoryProposals />);

  const card = await rendered.findByRole('listitem', { name: 'Enjoys a slow morning question' });

  expect(card).toHaveTextContent(
    'self-notenixie wrote it about itself, and every self-note waits for your review.',
  );
});

test('it shows the photo a proposal comes from beside its text', async () => {
  await createDeviceSession();

  const photo = await store.records.create({
    kind: 'owner_message',
    message: { images: [{ data: '/9j/4A==', mediaType: 'image/jpeg' }], text: 'Our new tiles.' },
    thread: 'conversation',
  });

  await store.memoryProposals.create({
    image: { position: 0, sequence: photo.sequence, thread: 'conversation' },
    origin: 'conversation',
    reason: 'from_photo',
    text: 'Has blue hexagonal kitchen tiles',
  });

  const rendered = render(<MemoryProposals />);

  const card = await rendered.findByRole('listitem', { name: 'Has blue hexagonal kitchen tiles' });
  const image = await within(card).findByRole('img', { name: 'Image 1' });

  expect(image.getAttribute('src')).toStartWith('blob:');

  expect(card).toHaveTextContent(
    'It comes from a photo you sent, and nixie never takes a photo as your words.',
  );
});

test("it shows a proposal's photo as unavailable once you forget the photo's message", async () => {
  await createDeviceSession();

  const photo = await store.records.create({
    kind: 'owner_message',
    message: { images: [{ data: '/9j/4A==', mediaType: 'image/jpeg' }], text: 'Our new tiles.' },
    thread: 'conversation',
  });

  await store.memoryProposals.create({
    image: { position: 0, sequence: photo.sequence, thread: 'conversation' },
    origin: 'conversation',
    reason: 'from_photo',
    text: 'Has blue hexagonal kitchen tiles',
  });

  await writeMockForget({
    clientActionID: '7e3a1c52-9b4d-4f80-a6e2-1d5c8b9f0a34',
    sequence: photo.sequence,
    thread: 'conversation',
  });

  const rendered = render(<MemoryProposals />);

  const card = await rendered.findByRole('listitem', { name: 'Has blue hexagonal kitchen tiles' });
  const gap = await within(card).findByText('Image unavailable');

  expect(gap).toBeInTheDocument();
  expect(within(card).queryByRole('img')).toBeNull();
});

test("it shows a proposal's photo as unavailable once you forget its message after the page showed the photo", async () => {
  const ctx = setupTest();

  await createDeviceSession();

  const photo = await store.records.create({
    kind: 'owner_message',
    message: { images: [{ data: '/9j/4A==', mediaType: 'image/jpeg' }], text: 'Our new tiles.' },
    thread: 'conversation',
  });

  await store.memoryProposals.create({
    image: { position: 0, sequence: photo.sequence, thread: 'conversation' },
    origin: 'conversation',
    reason: 'from_photo',
    text: 'Has blue hexagonal kitchen tiles',
  });

  const rendered = render(<RecordItem record={toLogRecord(photo)} />);

  await rendered.findByRole('img', { name: 'Image 1' });
  await ctx.user.click(rendered.getByRole('button', { name: 'Forget' }));
  await ctx.user.click(rendered.getByRole('button', { name: 'Forget for good' }));

  await waitFor(() => {
    expect(rendered.queryByRole('button', { name: 'Forget for good' })).toBeNull();
  });

  rendered.rerender(<MemoryProposals />);

  const card = await rendered.findByRole('listitem', { name: 'Has blue hexagonal kitchen tiles' });
  const gap = await within(card).findByText('Image unavailable');

  expect(gap).toBeInTheDocument();
  expect(within(card).queryByRole('img')).toBeNull();
});

test('it approves 3 selected proposals in one action, each with its own approval record', async () => {
  const ctx = setupTest();

  const session = await createDeviceSession();

  const proposals = await Promise.all(
    ['Keeps bees on the roof', 'Cycles to work on Mondays', 'Reads crime novels'].map((text) =>
      store.memoryProposals.create({ text }),
    ),
  );

  const rendered = render(<MemoryProposals />);

  await rendered.findByRole('listitem', { name: 'Reads crime novels' });
  await ctx.user.click(rendered.getByRole('checkbox', { name: 'Select all (0 of 3)' }));
  await ctx.user.click(rendered.getByRole('button', { name: 'Approve selected' }));
  await rendered.findByText('No proposal waits for you.');

  const records = store.records.findMany((query) =>
    query.where({ kind: 'memory.approval_recorded' }),
  );

  expect(records.map((record) => record.answer)).toIncludeSameMembers(
    proposals.map((proposal) => ({
      answer: 'approved',
      identityID: session.sessionID,
      proposalID: proposal.proposalID,
    })),
  );
});

test('it approves each selected proposal with the text you edited, and the rest as proposed', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  const [edited, kept] = await Promise.all([
    store.memoryProposals.create({ text: 'Keeps bes on the roof' }),
    store.memoryProposals.create({ text: 'Cycles to work on Mondays' }),
  ]);

  const rendered = render(<MemoryProposals />);

  const card = await rendered.findByRole('listitem', { name: 'Keeps bes on the roof' });

  await ctx.user.click(within(card).getByRole('button', { name: 'Edit' }));

  await ctx.user.type(within(card).getByRole('textbox', { name: 'Edited text' }), 'Keeps bees', {
    initialSelectionEnd: Number.POSITIVE_INFINITY,
    initialSelectionStart: 0,
  });

  await ctx.user.click(rendered.getByRole('checkbox', { name: 'Select all (0 of 2)' }));
  await ctx.user.click(rendered.getByRole('button', { name: 'Approve selected' }));
  await rendered.findByText('No proposal waits for you.');

  expect(
    store.memoryItems
      .all()
      .map((item) => [item.itemID, item.versions.at(-1)?.origin, item.versions.at(-1)?.text]),
  ).toIncludeSameMembers([
    [edited.itemID, 'owner', 'Keeps bees'],
    [kept.itemID, 'memory_writer', 'Cycles to work on Mondays'],
  ]);
});

test('it approves one proposal with your edited text', async () => {
  const ctx = setupTest();

  const session = await createDeviceSession();
  const proposal = await store.memoryProposals.create({ text: 'Keeps bes on the roof' });

  const rendered = render(<MemoryProposals />);

  const card = await rendered.findByRole('listitem', { name: 'Keeps bes on the roof' });

  await ctx.user.click(within(card).getByRole('button', { name: 'Edit' }));
  await ctx.user.clear(within(card).getByRole('textbox', { name: 'Edited text' }));
  await ctx.user.type(within(card).getByRole('textbox', { name: 'Edited text' }), 'Keeps bees');
  await ctx.user.click(within(card).getByRole('button', { name: 'Approve edited text' }));
  await rendered.findByText('No proposal waits for you.');

  expect(store.records.all().map((record) => record.answer)).toStrictEqual([
    { answer: 'edited', identityID: session.sessionID, proposalID: proposal.proposalID },
  ]);
});

test('it rejects one proposal with your reason', async () => {
  const ctx = setupTest();

  const session = await createDeviceSession();
  const proposal = await store.memoryProposals.create({ text: 'Keeps bees on the roof' });

  const rendered = render(<MemoryProposals />);

  const card = await rendered.findByRole('listitem', { name: 'Keeps bees on the roof' });

  await ctx.user.click(within(card).getByRole('button', { name: 'Reject' }));

  const form = within(card).getByRole('group', { name: 'Reject this proposal' });

  await ctx.user.type(
    within(form).getByRole('textbox', { name: 'Reason (optional)' }),
    'the bees were a neighbour',
  );

  await ctx.user.click(within(form).getByRole('button', { name: 'Reject' }));
  await rendered.findByText('No proposal waits for you.');

  expect(store.records.all()).toMatchObject([
    {
      answer: {
        answer: 'rejected',
        identityID: session.sessionID,
        proposalID: proposal.proposalID,
        reason: 'the bees were a neighbour',
      },
      kind: 'memory.proposal_rejected',
    },
  ]);
});

test('it rejects every selected proposal with one reason, each with its own rejection record', async () => {
  const ctx = setupTest();

  const session = await createDeviceSession();
  const first = await store.memoryProposals.create({ text: 'Keeps bees on the roof' });
  const second = await store.memoryProposals.create({ text: 'Cycles to work on Mondays' });

  const rendered = render(<MemoryProposals />);

  await rendered.findByRole('listitem', { name: 'Keeps bees on the roof' });
  await ctx.user.click(rendered.getByRole('checkbox', { name: 'Select all (0 of 2)' }));

  await ctx.user.type(
    rendered.getByRole('textbox', { name: 'Reason for rejecting (optional)' }),
    'both were about a guest',
  );

  await ctx.user.click(rendered.getByRole('button', { name: 'Reject selected' }));
  await rendered.findByText('No proposal waits for you.');

  expect(store.records.all().map((record) => record.answer)).toIncludeSameMembers([
    {
      answer: 'rejected',
      identityID: session.sessionID,
      proposalID: first.proposalID,
      reason: 'both were about a guest',
    },
    {
      answer: 'rejected',
      identityID: session.sessionID,
      proposalID: second.proposalID,
      reason: 'both were about a guest',
    },
  ]);
});

test('it shows an approval of a proposal that lapsed after the list loaded as stale, and writes no record', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  const proposal = await store.memoryProposals.create({ text: 'Keeps bees on the roof' });

  const rendered = render(<MemoryProposals />);

  const card = await rendered.findByRole('listitem', { name: 'Keeps bees on the roof' });

  await store.memoryProposals.update(proposal, {
    data(draft) {
      draft.lapseAt = new Date(Date.now() - 1000);
    },
  });

  await ctx.user.click(within(card).getByRole('button', { name: 'Approve' }));

  const notices = await rendered.findByRole('status', { name: 'Answers that changed nothing' });

  expect(notices).toHaveTextContent(
    '“Keeps bees on the roof”: Nothing changed: this proposal lapsed before your answer.',
  );

  expect(store.records.all()).toStrictEqual([]);
});

test('it holds an approval that an active item states, then adds it as a new item when you choose', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  await store.memoryItems.create({ versions: [{ text: 'Keeps bees on the roof' }] });

  const proposal = await store.memoryProposals.create({ text: 'keeps bees on the roof' });

  const rendered = render(<MemoryProposals />);

  const card = await rendered.findByRole('listitem', { name: 'keeps bees on the roof' });

  await ctx.user.click(within(card).getByRole('button', { name: 'Approve' }));

  const choice = await within(card).findByRole('group', {
    name: 'An active item already says this',
  });

  await ctx.user.click(within(choice).getByRole('button', { name: 'Add as a new item' }));
  await rendered.findByText('No proposal waits for you.');

  await waitFor(() => {
    expect(
      store.memoryItems.findFirst((query) => query.where({ itemID: proposal.itemID }))?.versions,
    ).toMatchObject([{ text: 'keeps bees on the roof' }]);
  });
});

test('it revises the item that already says it when you choose', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  const item = await store.memoryItems.create({ versions: [{ text: 'Keeps bees on the roof' }] });

  await store.memoryProposals.create({ text: 'keeps bees on the roof' });

  const rendered = render(<MemoryProposals />);

  const card = await rendered.findByRole('listitem', { name: 'keeps bees on the roof' });

  await ctx.user.click(within(card).getByRole('button', { name: 'Approve' }));

  const choice = await within(card).findByRole('group', {
    name: 'An active item already says this',
  });

  await ctx.user.click(within(choice).getByRole('button', { name: 'Revise that item' }));
  await rendered.findByText('No proposal waits for you.');

  expect(
    store.memoryItems.findFirst((query) => query.where({ itemID: item.itemID }))?.versions,
  ).toMatchObject([{ text: 'Keeps bees on the roof' }, { text: 'keeps bees on the roof' }]);
});

test('it shows a revision of an item that changed after the match as stale', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  const [item] = await Promise.all([
    store.memoryItems.create({ versions: [{ text: 'Keeps bees on the roof' }] }),
    store.memoryProposals.create({ text: 'keeps bees on the roof' }),
  ]);

  const rendered = render(<MemoryProposals />);

  const card = await rendered.findByRole('listitem', { name: 'keeps bees on the roof' });

  await ctx.user.click(within(card).getByRole('button', { name: 'Approve' }));

  const choice = await within(card).findByRole('group', {
    name: 'An active item already says this',
  });

  await writeMockMemoryChange({
    change: 'retire',
    clientActionID: '9a3e6c21-4b7d-4f8a-b2c5-1d0e7f9a6b34',
    itemID: item.itemID,
    version: 1,
  });

  await ctx.user.click(within(choice).getByRole('button', { name: 'Revise that item' }));

  const notices = await rendered.findByRole('status', { name: 'Answers that changed nothing' });

  expect(notices).toHaveTextContent(
    '“keeps bees on the roof”: Nothing changed: the item changed after the proposal was made.',
  );
});
