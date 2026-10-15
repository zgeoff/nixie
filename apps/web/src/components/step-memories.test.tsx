import { expect, test } from 'bun:test';
import { within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, delay, http } from 'msw';
import { server } from '../mocks/node';
import { store } from '../mocks/store';
import { createDeviceSession } from '../test-utils/create-device-session';
import { render } from '../test-utils/render';
import { StepMemories } from './step-memories';

test('it opens a memory to its full text', async () => {
  const user = userEvent.setup();

  await createDeviceSession();

  await store.memoryVersions.create({
    itemID: 'item-1',
    text: 'Stub memory one\nwith a second line',
    version: 1,
  });

  const rendered = render(
    <StepMemories memories={[{ itemID: 'item-1', score: 0.61, version: 1 }]} />,
  );

  await user.click(rendered.getByText('Memories 1'));

  const memory = await rendered.findByText('item-1 0.61 Stub memory one…');

  await user.click(memory);

  expect(
    within(rendered.getByRole('group', { name: 'item-1' })).getByText(/with a second line/u),
  ).toBeVisible();
});

test('it shows a dash for a memory recalled without a score', async () => {
  const user = userEvent.setup();

  await createDeviceSession();

  await store.memoryVersions.create({ itemID: 'item-1', text: 'Stub memory one', version: 1 });

  const rendered = render(<StepMemories memories={[{ itemID: 'item-1', version: 1 }]} />);

  await user.click(rendered.getByText('Memories 1'));

  const row = await rendered.findByText('item-1 – Stub memory one');

  expect(row).toBeVisible();
});

test('it shows each rating with its note beside the memory it rates', async () => {
  const user = userEvent.setup();

  await createDeviceSession();

  await Promise.all([
    store.memoryVersions.create({ itemID: 'item-1', text: 'Stub memory one', version: 1 }),
    store.memoryVersions.create({ itemID: 'item-2', text: 'Stub memory two', version: 1 }),
    store.memoryVersions.create({ itemID: 'item-3', text: 'Stub memory three', version: 1 }),
    store.ratingNotes.create({ itemID: 'item-2', sequence: 40, text: 'matches any question' }),
  ]);

  const rendered = render(
    <StepMemories
      memories={[
        {
          itemID: 'item-1',
          rating: { hasNote: false, ratedBy: 'Pip', sequence: 40, verdict: 'helpful' },
          version: 1,
        },
        {
          itemID: 'item-2',
          rating: { hasNote: true, ratedBy: 'Pip', sequence: 40, verdict: 'noise' },
          version: 1,
        },
        { itemID: 'item-3', version: 1 },
      ]}
    />,
  );

  await user.click(rendered.getByText('Memories 3'));
  await rendered.findByText('item-2 – Stub memory two [Pip: noise · "matches any question"]');

  expect(
    rendered.getAllByRole('group').map((row) => row.querySelector('summary')?.textContent),
  ).toStrictEqual([
    'Memories 3',
    'item-1  –  Stub memory one  [Pip: helpful]',
    'item-2  –  Stub memory two  [Pip: noise · "matches any question"]',
    'item-3  –  Stub memory three',
  ]);
});

test('it shows the note of a forgotten memory as forgotten, under the plain label when the config names no agent', async () => {
  const user = userEvent.setup();

  await createDeviceSession();

  await Promise.all([
    store.memoryVersions.create({ itemID: 'item-1', status: 'shredded', version: 1 }),
    store.ratingNotes.create({ itemID: 'item-1', sequence: 12, status: 'shredded' }),
  ]);

  const rendered = render(
    <StepMemories
      memories={[
        {
          itemID: 'item-1',
          rating: { hasNote: true, sequence: 12, verdict: 'noise' },
          version: 1,
        },
      ]}
    />,
  );

  await user.click(rendered.getByText('Memories 1'));

  const row = await rendered.findByText('item-1 – (forgotten) [agent: noise · (note forgotten)]');

  expect(row).toBeVisible();
});

test('it reads the text of more memories than one call to the API takes', async () => {
  const user = userEvent.setup();

  const memories = Array.from({ length: 101 }, (_, index) => ({
    itemID: `item-${index}`,
    version: 1,
  }));

  await createDeviceSession();

  await Promise.all(
    memories.map((memory) =>
      store.memoryVersions.create({ ...memory, text: `Stub ${memory.itemID}` }),
    ),
  );

  const rendered = render(<StepMemories memories={memories} />);

  await user.click(rendered.getByText('Memories 101'));

  const last = await rendered.findByText('item-100 – Stub item-100');

  expect(last).toBeVisible();
  expect(rendered.getByText('item-0 – Stub item-0')).toBeVisible();
});

test('it shows a memory forgotten since the section last opened as forgotten', async () => {
  const user = userEvent.setup();

  const [version] = await Promise.all([
    store.memoryVersions.create({ itemID: 'item-1', text: 'Stub memory one', version: 1 }),
    createDeviceSession(),
  ]);

  const rendered = render(
    <StepMemories memories={[{ itemID: 'item-1', score: 0.61, version: 1 }]} />,
  );

  await user.click(rendered.getByText('Memories 1'));
  await rendered.findByText('item-1 0.61 Stub memory one');
  await user.click(rendered.getByText('Memories 1'));

  await store.memoryVersions.update(version, {
    data(draft) {
      draft.status = 'shredded';
    },
  });

  await user.click(rendered.getByText('Memories 1'));

  const forgotten = await rendered.findByText('item-1 0.61 (forgotten)');

  expect(forgotten).toBeVisible();
});

test('it hides the old text of a memory forgotten since the section last opened while its read is pending', async () => {
  const user = userEvent.setup();

  const [version] = await Promise.all([
    store.memoryVersions.create({ itemID: 'item-1', text: 'Stub memory one', version: 1 }),
    createDeviceSession(),
  ]);

  const rendered = render(
    <StepMemories memories={[{ itemID: 'item-1', score: 0.61, version: 1 }]} />,
  );

  await user.click(rendered.getByText('Memories 1'));
  await rendered.findByText('item-1 0.61 Stub memory one');

  // the closed section reads nothing, so the forget lands while it is closed
  await Promise.all([
    user.click(rendered.getByText('Memories 1')),
    store.memoryVersions.update(version, {
      data(draft) {
        draft.status = 'shredded';
      },
    }),
  ]);

  server.use(http.post('*/rpc/memory/readVersions', () => delay('infinite')));

  await user.click(rendered.getByText('Memories 1'));
  await rendered.findByText('item-1 0.61 loading…');

  expect(rendered.queryByText(/Stub memory one/u)).toBeNull();
});

test('it shows a memory forgotten since the section last opened as unavailable when its read fails', async () => {
  const user = userEvent.setup();

  const [version] = await Promise.all([
    store.memoryVersions.create({ itemID: 'item-1', text: 'Stub memory one', version: 1 }),
    createDeviceSession(),
  ]);

  const rendered = render(
    <StepMemories memories={[{ itemID: 'item-1', score: 0.61, version: 1 }]} />,
  );

  await user.click(rendered.getByText('Memories 1'));
  await rendered.findByText('item-1 0.61 Stub memory one');

  // the closed section reads nothing, so the forget lands while it is closed
  await Promise.all([
    user.click(rendered.getByText('Memories 1')),
    store.memoryVersions.update(version, {
      data(draft) {
        draft.status = 'shredded';
      },
    }),
  ]);

  server.use(http.post('*/rpc/memory/readVersions', () => HttpResponse.error()));

  await user.click(rendered.getByText('Memories 1'));
  await rendered.findByText('item-1 0.61 (text unavailable)');

  expect(rendered.queryByText(/Stub memory one/u)).toBeNull();
});

test('it shows two scores near zero with their significant digits', async () => {
  const user = userEvent.setup();

  await createDeviceSession();

  await Promise.all([
    store.memoryVersions.create({ itemID: 'item-1', text: 'Stub memory one', version: 1 }),
    store.memoryVersions.create({ itemID: 'item-2', text: 'Stub memory two', version: 1 }),
  ]);

  const rendered = render(
    <StepMemories
      memories={[
        { itemID: 'item-1', score: 1.073e-6, version: 1 },
        { itemID: 'item-2', score: 7.857e-7, version: 1 },
      ]}
    />,
  );

  await user.click(rendered.getByText('Memories 2'));

  const first = await rendered.findByText('item-1 1.1e-6 Stub memory one');

  expect(first).toBeVisible();
  expect(rendered.getByText('item-2 7.9e-7 Stub memory two')).toBeVisible();
});
