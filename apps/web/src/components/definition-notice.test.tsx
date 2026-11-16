import { expect, test } from 'bun:test';
import { waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { store } from '../mocks/store';
import { buildMockDefinitionNotice } from '../test-utils/build-mock-definition-notice';
import { createDeviceSession } from '../test-utils/create-device-session';
import { render } from '../test-utils/render';
import { DefinitionNotice } from './definition-notice';

test('it shows the sentence of the change with an Undo', () => {
  const rendered = render(<DefinitionNotice notice={buildMockDefinitionNotice()} />);

  expect(rendered.getByRole('note')).toHaveTextContent(
    'Scheduled: Water the tomatoes, every Friday at 08:00 (next: Fri 12 Mar). Undo',
  );
});

test('it shows no Undo for a superseded change', () => {
  const rendered = render(
    <DefinitionNotice notice={buildMockDefinitionNotice({ state: 'superseded', next: null })} />,
  );

  expect(rendered.queryByRole('button', { name: 'Undo' })).toBeNull();
});

test('it undoes the change and says so', async () => {
  const user = userEvent.setup();

  await createDeviceSession();

  await store.records.create({
    kind: 'definition.changed',
    definitionNotice: buildMockDefinitionNotice(),
  });

  const rendered = render(<DefinitionNotice notice={buildMockDefinitionNotice()} />);

  await user.click(rendered.getByRole('button', { name: 'Undo' }));

  await waitFor(() => {
    expect(rendered.getByRole('status')).toHaveTextContent('Undone.');
  });

  expect(rendered.queryByRole('button', { name: 'Undo' })).toBeNull();
});

test('it shows the head change when a later change replaced this one', async () => {
  const user = userEvent.setup();

  await createDeviceSession();

  await store.records.create({
    kind: 'definition.changed',
    definitionNotice: buildMockDefinitionNotice(),
  });

  await store.records.create({
    kind: 'definition.changed',
    definitionNotice: buildMockDefinitionNotice({
      operation: 'change',
      shortID: 'w5n1c8d3ra',
      changeID: 'c-2',
    }),
  });

  const rendered = render(<DefinitionNotice notice={buildMockDefinitionNotice()} />);

  await user.click(rendered.getByRole('button', { name: 'Undo' }));

  const alert = await rendered.findByRole('alert');

  expect(alert).toHaveTextContent('Change w5n1c8d3ra replaced this one. Undo that change instead.');
});
