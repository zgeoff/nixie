import { expect, test } from 'bun:test';
import { buildBrowserClient } from './build-browser-client';
import { Conversation } from './components/conversation';
import { MemoryView } from './components/memory-view';
import { store } from './mocks/store';
import { createDeviceSession } from './test-utils/create-device-session';
import { render } from './test-utils/render';

// the live stream replays the forget soon after the return, so the check reads the first screen
test('it shows no forgotten text when you come back to the conversation from the memory view', async () => {
  await createDeviceSession();

  const message = await store.records.create({
    kind: 'owner_message',
    message: { text: 'The shed code is 4417.' },
  });

  const rendered = render(<Conversation thread="conversation" />);

  await rendered.findByText('The shed code is 4417.');

  await buildBrowserClient().conversation.forget({
    clientActionID: '3c9a1e7f-5b2d-4f8a-a6c4-0e1d2b3f4a5c',
    sequence: message.sequence,
    thread: 'conversation',
  });

  rendered.rerender(<MemoryView />);
  rendered.rerender(<Conversation thread="conversation" />);

  expect(rendered.container).not.toHaveTextContent('The shed code is 4417.');
});

test('it reads a fresh page without the forgotten text when you come back', async () => {
  await createDeviceSession();

  const message = await store.records.create({
    kind: 'owner_message',
    message: { text: 'The shed code is 4417.' },
  });

  const rendered = render(<Conversation thread="conversation" />);

  await rendered.findByText('The shed code is 4417.');

  await buildBrowserClient().conversation.forget({
    clientActionID: '3c9a1e7f-5b2d-4f8a-a6c4-0e1d2b3f4a5c',
    sequence: message.sequence,
    thread: 'conversation',
  });

  rendered.rerender(<MemoryView />);
  rendered.rerender(<Conversation thread="conversation" />);

  const list = await rendered.findByRole('list', { name: 'Conversation' });

  expect(list).toHaveTextContent(/^You Forgotten/u);
});
