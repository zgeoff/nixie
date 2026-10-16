import { expect, test } from 'bun:test';
import { waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { store } from '../mocks/store';
import { createDeviceSession } from '../test-utils/create-device-session';
import { render } from '../test-utils/render';
import { MemoryProposals } from './memory-proposals';

async function setupTest() {
  const user = userEvent.setup();

  // every proposal read and answer needs a signed-in browser
  const session = await createDeviceSession();

  return { user, session };
}

test('it lists a pending proposal with why it waits for review, its quote inside its message, and when it lapses', async () => {
  await setupTest();

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

test('it approves 3 selected proposals in one action, each with its own approval record', async () => {
  const ctx = await setupTest();

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
      identityID: ctx.session.sessionID,
      proposalID: proposal.proposalID,
    })),
  );
});

test('it approves each selected proposal with the text you edited, and the rest as proposed', async () => {
  const ctx = await setupTest();

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
  const ctx = await setupTest();
  const proposal = await store.memoryProposals.create({ text: 'Keeps bes on the roof' });

  const rendered = render(<MemoryProposals />);

  const card = await rendered.findByRole('listitem', { name: 'Keeps bes on the roof' });

  await ctx.user.click(within(card).getByRole('button', { name: 'Edit' }));
  await ctx.user.clear(within(card).getByRole('textbox', { name: 'Edited text' }));
  await ctx.user.type(within(card).getByRole('textbox', { name: 'Edited text' }), 'Keeps bees');
  await ctx.user.click(within(card).getByRole('button', { name: 'Approve edited text' }));
  await rendered.findByText('No proposal waits for you.');

  expect(store.records.all().map((record) => record.answer)).toStrictEqual([
    { answer: 'edited', identityID: ctx.session.sessionID, proposalID: proposal.proposalID },
  ]);
});

test('it rejects one proposal with your reason', async () => {
  const ctx = await setupTest();
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
        identityID: ctx.session.sessionID,
        proposalID: proposal.proposalID,
        reason: 'the bees were a neighbour',
      },
      kind: 'memory.proposal_rejected',
    },
  ]);
});

test('it rejects every selected proposal with one reason, each with its own rejection record', async () => {
  const ctx = await setupTest();
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
      identityID: ctx.session.sessionID,
      proposalID: first.proposalID,
      reason: 'both were about a guest',
    },
    {
      answer: 'rejected',
      identityID: ctx.session.sessionID,
      proposalID: second.proposalID,
      reason: 'both were about a guest',
    },
  ]);
});

test('it shows an approval of a proposal that lapsed after the list loaded as stale, and writes no record', async () => {
  const ctx = await setupTest();
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
  const ctx = await setupTest();

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
  const ctx = await setupTest();
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
