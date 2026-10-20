import { expect, test } from 'bun:test';
import { store } from '../mocks/store';
import { ConversationPageSize } from './conversation-page-size';
import { createDeviceSession } from './create-device-session';
import { render } from './render';

test('it shows the label and how many records the conversation page holds', async () => {
  await createDeviceSession();

  await Promise.all([
    store.records.create({ kind: 'owner_message', message: { text: 'Is the kettle on?' } }),
    store.records.create({ kind: 'owner_message', message: { text: 'The tea is ready.' } }),
  ]);

  const rendered = render(<ConversationPageSize label="first" />);

  const size = await rendered.findByText('first: 2 records');

  expect(size).toBeInTheDocument();
});

test('it counts only the records of the conversation thread', async () => {
  await createDeviceSession();

  await Promise.all([
    store.records.create({ kind: 'owner_message', message: { text: 'Is the kettle on?' } }),
    store.records.create({
      kind: 'owner_message',
      message: { text: 'Water the tomatoes at six.' },
      thread: 'task:garden',
    }),
  ]);

  const rendered = render(<ConversationPageSize label="first" />);

  const size = await rendered.findByText('first: 1 records');

  expect(size).toBeInTheDocument();
});
