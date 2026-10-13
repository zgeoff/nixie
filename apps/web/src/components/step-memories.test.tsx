import { expect, test } from 'bun:test';
import { within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
