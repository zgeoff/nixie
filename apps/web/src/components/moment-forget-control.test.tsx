import { expect, mock, test } from 'bun:test';
import { waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { store } from '../mocks/store';
import { createDeviceSession } from '../test-utils/create-device-session';
import { render } from '../test-utils/render';
import { MomentView } from './moment-view';

function setupTest() {
  const user = userEvent.setup();

  return { user };
}

test('it previews the title, the note and each reflection the forget removes', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  const moment = await store.moments.create({
    title: 'The ladder on the stairs',
    note: { text: 'Never leave it on the landing.', writtenAt: new Date('2026-10-04T09:00:00Z') },
    reflections: [
      {
        model: 'claude-test-4',
        text: 'The fall was about haste.',
        writtenAt: new Date('2026-10-02T09:00:00Z'),
      },
    ],
  });

  const rendered = render(<MomentView momentID={moment.momentID} onForgotten={() => {}} />);

  const forget = await rendered.findByRole('button', { name: 'Forget this moment' });

  await ctx.user.click(forget);

  const losses = await rendered.findByRole('list', { name: 'What the forget removes' });

  expect(
    within(losses)
      .getAllByRole('listitem')
      .map((loss) => loss.textContent),
  ).toStrictEqual([
    'The title: The ladder on the stairs',
    'Your note: Never leave it on the landing.',
    `The reflection by claude-test-4, ${new Date('2026-10-02T09:00:00Z').toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}: The fall was about haste.`,
  ]);
});

test('it tells the user that the messages and replies of the span, and those that quote the moment, stay', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  await store.records.create({ sequence: 4, kind: 'owner_message' });
  await store.records.create({ sequence: 5, kind: 'model.reply' });

  const moment = await store.moments.create({ firstSequence: 4, lastSequence: 5 });

  const rendered = render(<MomentView momentID={moment.momentID} onForgotten={() => {}} />);

  const forget = await rendered.findByRole('button', { name: 'Forget this moment' });

  await ctx.user.click(forget);

  const confirmation = rendered.getByRole('group', { name: 'Forget this moment' });

  const kept = await within(confirmation).findByText(/of the conversation stay/u);

  expect(kept).toHaveTextContent(
    "The 2 records of the conversation stay. Your messages and nixie's replies stay, and so do the messages and replies that quote this moment. Forget each one from the conversation.",
  );
});

test('it forgets the moment once the user confirms, and leaves the view', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  const moment = await store.moments.create({ title: 'The ladder on the stairs' });

  const onForgotten = mock(() => {});
  const rendered = render(<MomentView momentID={moment.momentID} onForgotten={onForgotten} />);

  const forget = await rendered.findByRole('button', { name: 'Forget this moment' });

  await ctx.user.click(forget);
  await rendered.findByRole('list', { name: 'What the forget removes' });
  await ctx.user.click(rendered.getByRole('button', { name: 'Forget for good' }));

  const forgotten = await rendered.findByRole('group', { name: 'This moment is forgotten' });

  expect(forgotten).toHaveTextContent(/Key backups: pending/u);

  await ctx.user.click(within(forgotten).getByRole('button', { name: 'Back to the moments' }));

  await waitFor(() => {
    expect(onForgotten).toHaveBeenCalledOnce();
  });

  expect(
    store.moments.findFirst((query) => query.where({ momentID: moment.momentID }))?.state,
  ).toBe('destroyed');
});

test('it marks the preview stale when the user edits the moment after the preview opens, and forgets nothing', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  const moment = await store.moments.create({ title: 'The ladder', note: null });

  const rendered = render(<MomentView momentID={moment.momentID} onForgotten={() => {}} />);

  const forget = await rendered.findByRole('button', { name: 'Forget this moment' });

  await ctx.user.click(forget);
  await rendered.findByRole('list', { name: 'What the forget removes' });
  await ctx.user.click(rendered.getByRole('button', { name: 'Add a note' }));

  await ctx.user.type(
    rendered.getByRole('textbox', { name: 'Why this moment matters, in your words' }),
    'Never leave it on the landing.',
  );

  await ctx.user.click(rendered.getByRole('button', { name: 'Save the note' }));

  const confirmation = rendered.getByRole('group', { name: 'Forget this moment' });

  const alert = await within(confirmation).findByRole('alert');

  expect(alert).toHaveTextContent(
    'This moment changed after the preview opened, so the preview is stale and nothing was forgotten. Close it, then open it again.',
  );

  expect(within(confirmation).getByRole('button', { name: 'Forget for good' })).toBeDisabled();
});

test('it marks the preview stale when the moment changed elsewhere before the user confirms', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  const moment = await store.moments.create({ title: 'The ladder' });

  const rendered = render(<MomentView momentID={moment.momentID} onForgotten={() => {}} />);

  const forget = await rendered.findByRole('button', { name: 'Forget this moment' });

  await ctx.user.click(forget);
  await rendered.findByRole('list', { name: 'What the forget removes' });

  await store.moments.update((query) => query.where({ momentID: moment.momentID }), {
    data(draft) {
      draft.version = 2;
    },
  });

  await ctx.user.click(rendered.getByRole('button', { name: 'Forget for good' }));

  const confirmation = rendered.getByRole('group', { name: 'Forget this moment' });

  const alert = await within(confirmation).findByRole('alert');

  expect(alert).toHaveTextContent('This moment changed after the preview opened');

  expect(
    store.moments.findFirst((query) => query.where({ momentID: moment.momentID }))?.state,
  ).toBe('active');
});
