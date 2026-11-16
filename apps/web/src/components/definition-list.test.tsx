import { expect, test } from 'bun:test';
import { waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { mockViewStore } from '../mocks/mock-view-store';
import { store } from '../mocks/store';
import { createDeviceSession } from '../test-utils/create-device-session';
import { render } from '../test-utils/render';
import { DefinitionList } from './definition-list';

test('it lists a definition with its rendered trigger, next fire and origin', async () => {
  await createDeviceSession();

  await mockViewStore.definitions.create({
    createdBy: { kind: 'definitions_seeded', sequence: 3 },
    definitionID: 'water-the-tomatoes',
    name: 'Water the tomatoes',
    next: 'Fri 12 Mar',
    origin: 'definitions',
    rendered: 'every Friday at 08:00',
  });

  const rendered = render(<DefinitionList />);

  const row = await rendered.findByRole('listitem', { name: 'Water the tomatoes' });

  expect(row).toHaveTextContent('every Friday at 08:00 · next: Fri 12 Mar');

  expect(row).toHaveTextContent(
    'From the definitions repo · created by the definitions_seeded record 3',
  );

  expect(rendered.queryByRole('button', { name: 'Undo' })).toBeNull();
});

test('it shows a definition as plain text, never as markup', async () => {
  await createDeviceSession();

  await mockViewStore.definitions.create({
    createdBy: { kind: 'definitions_seeded', sequence: 3 },
    definitionID: 'x',
    name: '<b>bold</b>',
    origin: 'definitions',
  });

  const rendered = render(<DefinitionList />);

  const name = await rendered.findByText('<b>bold</b>');

  expect(name).toBeVisible();
  expect(rendered.container.querySelector('b')).toBeNull();
});

test('it shows the missing-content marker for a definition whose content is lost', async () => {
  await createDeviceSession();

  await mockViewStore.definitions.create({
    createdBy: { kind: 'definitions_seeded', sequence: 3 },
    definitionID: 'x',
    isUnreadable: true,
    name: 'hidden name',
    origin: 'definitions',
  });

  const rendered = render(<DefinitionList />);

  const marker = await rendered.findByText('[content unavailable]');

  expect(marker).toBeVisible();
  expect(rendered.queryByText('hidden name')).toBeNull();
});

test('it undoes a definition that nixie made, and its row leaves the list', async () => {
  const user = userEvent.setup();

  await createDeviceSession();

  const change = await store.records.create({
    definitionNotice: {
      changeID: '0b9d8f0e-6f1c-4d2a-9b7e-3c5a1d2e4f60',
      definitionID: 'water-the-tomatoes',
      name: 'Water the tomatoes',
      operation: 'add',
      shortID: 'k3x9m2p7qa',
    },
    kind: 'definition.changed',
    thread: 'conversation',
  });

  const created = await mockViewStore.definitions.create({
    createdBy: { kind: 'definition.changed', sequence: change.sequence },
    definitionID: 'water-the-tomatoes',
    name: 'Water the tomatoes',
    origin: 'nixie',
  });

  const rendered = render(<DefinitionList />);

  await waitFor(() => {
    expect(rendered.getByRole('button', { name: 'Undo' })).toBeEnabled();
  });

  mockViewStore.definitions.delete(created);

  await user.click(rendered.getByRole('button', { name: 'Undo' }));

  await waitFor(() => {
    expect(rendered.queryByRole('listitem', { name: 'Water the tomatoes' })).toBeNull();
  });
});

test('it shows the refusal of an undo that the server refuses', async () => {
  const user = userEvent.setup();

  await createDeviceSession();

  await mockViewStore.definitions.create({
    createdBy: { kind: 'definition.changed', sequence: 9 },
    definitionID: 'water-the-tomatoes',
    name: 'Water the tomatoes',
    origin: 'nixie',
  });

  await store.records.create({
    definitionNotice: {
      changeID: '0b9d8f0e-6f1c-4d2a-9b7e-3c5a1d2e4f60',
      definitionID: 'water-the-tomatoes',
      name: 'Water the tomatoes',
      operation: 'add',
      shortID: 'k3x9m2p7qa',
    },
    kind: 'definition.changed',
    sequence: 9,
    thread: 'conversation',
  });

  await store.records.create({
    definitionNotice: {
      changeID: '5d7f9b1c-3e2a-4c6d-8f0b-1a3c5e7d9f24',
      definitionID: 'water-the-tomatoes',
      name: 'Water the tomatoes',
      operation: 'change',
      shortID: 'p8q2r4s6ta',
    },
    kind: 'definition.changed',
    sequence: 10,
    thread: 'conversation',
  });

  const rendered = render(<DefinitionList />);

  await waitFor(() => {
    expect(rendered.getByRole('button', { name: 'Undo' })).toBeEnabled();
  });

  await user.click(rendered.getByRole('button', { name: 'Undo' }));

  const refusal = await rendered.findByRole('alert');

  expect(refusal).toHaveTextContent(
    'Change p8q2r4s6ta replaced this one. Undo that change instead.',
  );
});
