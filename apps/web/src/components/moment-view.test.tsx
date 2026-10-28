import { expect, test } from 'bun:test';
import { within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { store } from '../mocks/store';
import { createDeviceSession } from '../test-utils/create-device-session';
import { render } from '../test-utils/render';
import { MomentView } from './moment-view';

function setupTest() {
  const user = userEvent.setup();

  return { user };
}

test('it shows the note with its own date, each reflection with its model and date, and the edit date', async () => {
  await createDeviceSession();

  const moment = await store.moments.create({
    title: 'The ladder on the stairs',
    titleBy: 'model',
    keptAt: new Date('2026-10-01T09:00:00Z'),
    editedAt: new Date('2026-10-06T09:00:00Z'),
    note: { text: 'Never leave it on the landing.', writtenAt: new Date('2026-10-04T09:00:00Z') },
    reflections: [
      {
        model: 'claude-test-4',
        text: 'The fall was about haste, not the ladder.',
        writtenAt: new Date('2026-10-02T09:00:00Z'),
      },
    ],
  });

  const rendered = render(<MomentView momentID={moment.momentID} onDestroyed={() => {}} />);

  const heading = await rendered.findByRole('heading', { name: 'The ladder on the stairs' });

  const note = rendered.getByRole('region', { name: 'Your note' });
  const reflections = rendered.getByRole('region', { name: 'Reflections' });

  expect(heading.parentElement).toHaveTextContent('(title by a model)');

  expect(rendered.getByText(/^Kept /u)).toHaveTextContent(
    `Kept ${new Date('2026-10-01T09:00:00Z').toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })} by nixie · edited ${new Date('2026-10-06T09:00:00Z').toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}`,
  );

  expect(note).toHaveTextContent(
    `Never leave it on the landing.Written ${new Date('2026-10-04T09:00:00Z').toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}`,
  );

  expect(
    within(reflections).getByRole('listitem', {
      name: `Reflection by claude-test-4, ${new Date('2026-10-02T09:00:00Z').toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}`,
    }),
  ).toHaveTextContent('The fall was about haste, not the ladder.');
});

test("it shows the span's messages and replies, and a gap where a record was forgotten", async () => {
  await createDeviceSession();

  await store.records.create({
    sequence: 4,
    kind: 'owner_message',
    message: { text: 'the ladder slipped on the stairs' },
  });

  await store.records.create({ sequence: 5, kind: 'owner_message' });

  await store.records.create({
    sequence: 6,
    kind: 'model.reply',
    message: { text: 'Keep it in the shed from now on.' },
  });

  const moment = await store.moments.create({ firstSequence: 4, lastSequence: 6 });

  const rendered = render(<MomentView momentID={moment.momentID} onDestroyed={() => {}} />);

  const records = await rendered.findByRole('list', { name: 'Records' });

  expect(
    within(records)
      .getAllByRole('listitem')
      .map((record) => record.textContent),
  ).toStrictEqual([
    'You · record 4the ladder slipped on the stairs',
    'Record 5: this part is gone. It was forgotten, and the moment keeps its place.',
    'nixie · record 6Keep it in the shed from now on.',
  ]);
});

test('it renames the moment, which then shows the title as yours', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  const moment = await store.moments.create({ title: 'The ladder', titleBy: 'model' });

  const rendered = render(<MomentView momentID={moment.momentID} onDestroyed={() => {}} />);

  const rename = await rendered.findByRole('button', { name: 'Rename' });

  await ctx.user.click(rename);
  await ctx.user.clear(rendered.getByRole('textbox', { name: 'Title' }));
  await ctx.user.type(rendered.getByRole('textbox', { name: 'Title' }), 'The ladder on the stairs');
  await ctx.user.click(rendered.getByRole('button', { name: 'Save the title' }));

  const heading = await rendered.findByRole('heading', { name: 'The ladder on the stairs' });

  expect(heading.parentElement).not.toHaveTextContent('(title by a model)');
});

test('it adds a note to a moment that had none, dated the day it was written', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  const moment = await store.moments.create({ note: null });

  const rendered = render(<MomentView momentID={moment.momentID} onDestroyed={() => {}} />);

  const add = await rendered.findByRole('button', { name: 'Add a note' });

  await ctx.user.click(add);

  await ctx.user.type(
    rendered.getByRole('textbox', { name: 'Why this moment matters, in your words' }),
    'Never leave it on the landing.',
  );

  await ctx.user.click(rendered.getByRole('button', { name: 'Save the note' }));

  const note = rendered.getByRole('region', { name: 'Your note' });

  const text = await within(note).findByText('Never leave it on the landing.');

  expect(text).toBeVisible();

  expect(note).toHaveTextContent(
    `Written ${new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}`,
  );
});

test('it removes a reflection', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  const moment = await store.moments.create({
    reflections: [{ model: 'claude-test-4', text: 'The fall was about haste.' }],
  });

  const rendered = render(<MomentView momentID={moment.momentID} onDestroyed={() => {}} />);

  const remove = await rendered.findByRole('button', { name: 'Remove this reflection' });

  await ctx.user.click(remove);

  const empty = await rendered.findByText('No model has reflected on this moment yet.');

  expect(empty).toBeVisible();
});

test('it links a memory item that the user names by its short ID', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  const item = await store.memoryItems.create({
    shortID: 'k3m9qa',
    versions: [{ text: 'Keeps the ladder in the shed' }],
  });

  const moment = await store.moments.create({});

  const rendered = render(<MomentView momentID={moment.momentID} onDestroyed={() => {}} />);

  const itemID = await rendered.findByRole('textbox', { name: 'Memory item ID' });

  await ctx.user.type(itemID, 'k3m9qa');
  await ctx.user.click(rendered.getByRole('button', { name: 'Link the item' }));

  const linked = await rendered.findByRole('listitem', { name: 'k3m9qa' });

  expect(linked).toHaveTextContent('k3m9qa: Keeps the ladder in the shed');

  expect(within(linked).getByRole('link', { name: 'k3m9qa' })).toHaveAttribute(
    'href',
    `/memory?item=${item.itemID}`,
  );
});

test('it removes a link', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  const item = await store.memoryItems.create({
    shortID: 'k3m9qa',
    versions: [{ text: 'Keeps the ladder in the shed' }],
  });

  const moment = await store.moments.create({ linkedItemIDs: [item.itemID] });

  const rendered = render(<MomentView momentID={moment.momentID} onDestroyed={() => {}} />);

  const linked = await rendered.findByRole('listitem', { name: 'k3m9qa' });

  await ctx.user.click(within(linked).getByRole('button', { name: 'Remove the link' }));

  const empty = await rendered.findByText('No memory item links to this moment.');

  expect(empty).toBeVisible();
});

test("it moves the span's edges, and the span then shows the record it took in", async () => {
  const ctx = setupTest();

  await createDeviceSession();

  await store.records.create({ sequence: 4, kind: 'owner_message', message: { text: 'ladder' } });
  await store.records.create({ sequence: 5, kind: 'model.reply', message: { text: 'shed' } });

  const moment = await store.moments.create({ firstSequence: 4, lastSequence: 4 });

  const rendered = render(<MomentView momentID={moment.momentID} onDestroyed={() => {}} />);

  const last = await rendered.findByRole('textbox', { name: 'Last record' });

  await ctx.user.clear(last);
  await ctx.user.type(last, '5');
  await ctx.user.click(rendered.getByRole('button', { name: 'Move the edges' }));

  const record = await rendered.findByRole('listitem', { name: 'Record 5' });

  expect(record).toHaveTextContent('shed');
});

test('it refuses edges that leave the thread, and says why', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  await store.records.create({ sequence: 4, kind: 'owner_message', message: { text: 'ladder' } });

  const moment = await store.moments.create({ firstSequence: 4, lastSequence: 4 });

  const rendered = render(<MomentView momentID={moment.momentID} onDestroyed={() => {}} />);

  const last = await rendered.findByRole('textbox', { name: 'Last record' });

  await ctx.user.clear(last);
  await ctx.user.type(last, '9');
  await ctx.user.click(rendered.getByRole('button', { name: 'Move the edges' }));

  const alert = await rendered.findByRole('alert');

  expect(alert).toHaveTextContent(
    'The first and last records must both be on this thread, in order.',
  );
});

test('it says the moment changed when an edit meets a newer version', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  const moment = await store.moments.create({ title: 'The ladder' });

  const rendered = render(<MomentView momentID={moment.momentID} onDestroyed={() => {}} />);

  const rename = await rendered.findByRole('button', { name: 'Rename' });

  await ctx.user.click(rename);

  await store.moments.update((query) => query.where({ momentID: moment.momentID }), {
    data(draft) {
      draft.version = 2;
    },
  });

  await ctx.user.type(rendered.getByRole('textbox', { name: 'Title' }), ' on the stairs');
  await ctx.user.click(rendered.getByRole('button', { name: 'Save the title' }));

  const alert = await rendered.findByRole('alert');

  expect(alert).toHaveTextContent(
    'This moment changed after the page loaded. Check it, then try again.',
  );
});
