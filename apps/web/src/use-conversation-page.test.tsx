import { expect, test } from 'bun:test';
import { Activity } from 'react';
import { buildBrowserClient } from './build-browser-client';
import { Conversation } from './components/conversation';
import { MemoryView } from './components/memory-view';
import { store } from './mocks/store';
import { ConversationPageSize } from './test-utils/conversation-page-size';
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

// a hidden Activity stops the view's effects and keeps the view, as React's StrictMode does once at
// mount, so a page read again would hold the record that arrived meanwhile
test('it keeps the page it shows when its effects stop and start again in place', async () => {
  await createDeviceSession();

  await store.records.create({ kind: 'owner_message', message: { text: 'Is the kettle on?' } });

  const rendered = render(
    <Activity mode="visible">
      <ConversationPageSize label="first" />
    </Activity>,
  );

  await rendered.findByText('first: 1 records');

  rendered.rerender(
    <Activity mode="hidden">
      <ConversationPageSize label="first" />
    </Activity>,
  );

  await store.records.create({ kind: 'owner_message', message: { text: 'The tea is ready.' } });

  rendered.rerender(
    <Activity mode="visible">
      <ConversationPageSize label="first" />
    </Activity>,
  );

  const first = await rendered.findByText('first: 1 records');

  expect(first).toBeVisible();
});

test('it reads the page of the thread that the view moves to', async () => {
  await createDeviceSession();

  await Promise.all([
    store.records.create({ kind: 'owner_message', message: { text: 'Is the kettle on?' } }),
    store.records.create({
      kind: 'owner_message',
      message: { text: 'Water the tomatoes at six.' },
      thread: 'task:garden',
    }),
  ]);

  const rendered = render(<Conversation thread="conversation" />);

  await rendered.findByText('Is the kettle on?');

  rendered.rerender(<Conversation thread="task:garden" />);

  await rendered.findByText('Water the tomatoes at six.');

  expect(rendered.container).not.toHaveTextContent('Is the kettle on?');
});

test('it keeps the newer page that another view read while this one was hidden', async () => {
  await createDeviceSession();

  await store.records.create({ kind: 'owner_message', message: { text: 'Is the kettle on?' } });

  const rendered = render(
    <Activity mode="visible">
      <ConversationPageSize label="first" />
    </Activity>,
  );

  await rendered.findByText('first: 1 records');
  await store.records.create({ kind: 'owner_message', message: { text: 'The tea is ready.' } });

  rendered.rerender(
    <>
      <Activity mode="hidden">
        <ConversationPageSize label="first" />
      </Activity>
      <ConversationPageSize label="second" />
    </>,
  );

  await rendered.findByText('second: 2 records');

  rendered.rerender(
    <>
      <Activity mode="visible">
        <ConversationPageSize label="first" />
      </Activity>
      <ConversationPageSize label="second" />
    </>,
  );

  const first = await rendered.findByText('first: 2 records');

  expect(first).toBeVisible();
});
