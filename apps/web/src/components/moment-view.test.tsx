import { expect, mock, test } from 'bun:test';
import { within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { z } from 'zod';
import { server } from '../mocks/node';
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

test('it holds a note draft when another device changes the note, until the user keeps the draft', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  const moment = await store.moments.create({
    title: 'The ladder',
    note: { text: 'Never leave it on the landing.', writtenAt: new Date() },
  });

  const rendered = render(<MomentView momentID={moment.momentID} onDestroyed={() => {}} />);

  const edit = await rendered.findByRole('button', { name: 'Edit the note' });

  await ctx.user.click(edit);

  await ctx.user.type(
    rendered.getByRole('textbox', { name: 'Why this moment matters, in your words' }),
    ' Or in the hall.',
  );

  await store.moments.update((query) => query.where({ momentID: moment.momentID }), {
    data(draft) {
      draft.note = { text: 'Keep it in the shed.', writtenAt: new Date() };
      draft.version = 2;
    },
  });

  globalThis.dispatchEvent(new Event('visibilitychange'));

  const conflict = await rendered.findByRole('group', { name: 'The moment changed' });

  const save = rendered.getByRole('button', { name: 'Save the note' });
  const isHeld = save.hasAttribute('disabled');

  await ctx.user.click(within(conflict).getByRole('button', { name: 'Keep my draft' }));
  await ctx.user.click(save);
  await rendered.findByText('Never leave it on the landing. Or in the hall.');

  const saved = store.moments.findFirst((query) => query.where({ momentID: moment.momentID }));

  expect(isHeld).toBe(true);
  expect(saved?.note?.text).toBe('Never leave it on the landing. Or in the hall.');
  expect(saved?.version).toBe(3);
});

test('it replaces a note draft with the note another device wrote when the user takes the latest', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  const moment = await store.moments.create({
    title: 'The ladder',
    note: { text: 'Never leave it on the landing.', writtenAt: new Date() },
  });

  const rendered = render(<MomentView momentID={moment.momentID} onDestroyed={() => {}} />);

  const edit = await rendered.findByRole('button', { name: 'Edit the note' });

  await ctx.user.click(edit);

  const field = rendered.getByRole('textbox', { name: 'Why this moment matters, in your words' });

  await ctx.user.type(field, ' Or in the hall.');

  await store.moments.update((query) => query.where({ momentID: moment.momentID }), {
    data(draft) {
      draft.note = { text: 'Keep it in the shed.', writtenAt: new Date() };
      draft.version = 2;
    },
  });

  globalThis.dispatchEvent(new Event('visibilitychange'));

  const conflict = await rendered.findByRole('group', { name: 'The moment changed' });

  await ctx.user.click(within(conflict).getByRole('button', { name: 'Take the latest' }));

  expect(field).toHaveValue('Keep it in the shed.');
  expect(rendered.getByRole('button', { name: 'Save the note' })).toBeEnabled();
});

test('it holds a title draft when another device renames the moment', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  const moment = await store.moments.create({ title: 'The ladder' });

  const rendered = render(<MomentView momentID={moment.momentID} onDestroyed={() => {}} />);

  const rename = await rendered.findByRole('button', { name: 'Rename' });

  await ctx.user.click(rename);
  await ctx.user.type(rendered.getByRole('textbox', { name: 'Title' }), ' on the stairs');

  await store.moments.update((query) => query.where({ momentID: moment.momentID }), {
    data(draft) {
      draft.title = 'The step ladder';
      draft.version = 2;
    },
  });

  globalThis.dispatchEvent(new Event('visibilitychange'));

  const conflict = await rendered.findByRole('group', { name: 'The moment changed' });

  expect(conflict).toBeVisible();
  expect(rendered.getByRole('textbox', { name: 'Title' })).toHaveValue('The ladder on the stairs');
  expect(rendered.getByRole('button', { name: 'Save the title' })).toBeDisabled();
});

test('it holds an edges draft when another device moves the edges', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  const moment = await store.moments.create({
    title: 'The ladder',
    firstSequence: 2,
    lastSequence: 4,
  });

  const rendered = render(<MomentView momentID={moment.momentID} onDestroyed={() => {}} />);

  const first = await rendered.findByRole('textbox', { name: 'First record' });

  await ctx.user.clear(first);
  await ctx.user.type(first, '1');

  await store.moments.update((query) => query.where({ momentID: moment.momentID }), {
    data(draft) {
      draft.lastSequence = 6;
      draft.version = 2;
    },
  });

  globalThis.dispatchEvent(new Event('visibilitychange'));

  const conflict = await rendered.findByRole('group', { name: 'The moment changed' });

  expect(conflict).toBeVisible();
  expect(rendered.getByRole('textbox', { name: 'Last record' })).toHaveValue('4');
  expect(rendered.getByRole('button', { name: 'Move the edges' })).toBeDisabled();
});

test('it shows the edges another device moved when the user has not changed them', async () => {
  await createDeviceSession();

  const moment = await store.moments.create({
    title: 'The ladder',
    firstSequence: 2,
    lastSequence: 4,
  });

  const rendered = render(<MomentView momentID={moment.momentID} onDestroyed={() => {}} />);

  await rendered.findByRole('textbox', { name: 'Last record' });

  await store.moments.update((query) => query.where({ momentID: moment.momentID }), {
    data(draft) {
      draft.lastSequence = 6;
      draft.version = 2;
    },
  });

  globalThis.dispatchEvent(new Event('visibilitychange'));

  const moved = await rendered.findByText(
    'The moment holds records 2 to 6 of its conversation. Move an edge to hold more or less of it.',
  );

  expect(moved).toBeVisible();
  expect(rendered.getByRole('textbox', { name: 'Last record' })).toHaveValue('6');
  expect(rendered.queryByRole('group', { name: 'The moment changed' })).toBeNull();
});

test('it sends an edit that got no answer again with its first action ID and version', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  const moment = await store.moments.create({ title: 'The ladder' });

  const sent = mock((body: unknown) =>
    z.object({ json: z.object({ clientActionID: z.string(), version: z.number() }) }).parse(body),
  );

  server.use(
    http.post('*/rpc/memory/editMoment', async (call) => {
      const body: unknown = await call.request.clone().json();

      sent(body);
    }),
  );

  server.use(
    http.post(
      '*/rpc/memory/editMoment',
      async (call) => {
        const body: unknown = await call.request.clone().json();

        sent(body);

        return HttpResponse.error();
      },
      { once: true },
    ),
  );

  const rendered = render(<MomentView momentID={moment.momentID} onDestroyed={() => {}} />);

  const rename = await rendered.findByRole('button', { name: 'Rename' });

  await ctx.user.click(rename);
  await ctx.user.type(rendered.getByRole('textbox', { name: 'Title' }), ' on the stairs');
  await ctx.user.click(rendered.getByRole('button', { name: 'Save the title' }));

  const failed = await rendered.findByRole('alert');

  await ctx.user.click(rendered.getByRole('button', { name: 'Save the title' }));
  await rendered.findByRole('heading', { name: 'The ladder on the stairs' });

  const [first, second] = sent.mock.results.map((result) => result.value);

  expect(failed).toHaveTextContent('The change did not save. Try again.');
  expect(sent).toHaveBeenCalledTimes(2);
  expect(second).toStrictEqual(first);
});

test('it hides the moment once a read finds it destroyed elsewhere', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  const moment = await store.moments.create({ title: 'The ladder', note: null });

  const rendered = render(<MomentView momentID={moment.momentID} onDestroyed={() => {}} />);

  const add = await rendered.findByRole('button', { name: 'Add a note' });

  await store.moments.update((query) => query.where({ momentID: moment.momentID }), {
    data(draft) {
      draft.state = 'destroyed';
    },
  });

  await ctx.user.click(add);

  await ctx.user.type(
    rendered.getByRole('textbox', { name: 'Why this moment matters, in your words' }),
    'Never leave it on the landing.',
  );

  await ctx.user.click(rendered.getByRole('button', { name: 'Save the note' }));

  const gone = await rendered.findByText('This moment did not load. It may be gone.');

  expect(gone).toBeVisible();
  expect(rendered.queryByRole('heading', { name: 'The ladder' })).toBeNull();
});
