import { expect, test } from 'bun:test';
import { delay, http } from 'msw';
import type { ReactNode } from 'react';
import { Activity } from 'react';
import { buildBrowserClient } from './build-browser-client';
import { Conversation } from './components/conversation';
import { MemoryView } from './components/memory-view';
import { server } from './mocks/node';
import { store } from './mocks/store';
import { createDeviceSession } from './test-utils/create-device-session';
import { render } from './test-utils/render';
import { useConversationPage } from './use-conversation-page';

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
// mount, so any read after the first one would never answer
test('it keeps the page it shows when its effects stop and start again in place', async () => {
  await createDeviceSession();

  await store.records.create({ kind: 'owner_message', message: { text: 'Is the kettle on?' } });

  const rendered = render(
    <Activity mode="visible">
      <Conversation thread="conversation" />
    </Activity>,
  );

  await rendered.findByText('Is the kettle on?');

  server.use(http.post('*/rpc/conversation/read', () => delay('infinite')));

  rendered.rerender(
    <Activity mode="hidden">
      <Conversation thread="conversation" />
    </Activity>,
  );

  rendered.rerender(
    <Activity mode="visible">
      <Conversation thread="conversation" />
    </Activity>,
  );

  const message = await rendered.findByText('Is the kettle on?');

  expect(message).toBeVisible();
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
      <PageSize label="first" />
    </Activity>,
  );

  await rendered.findByText('first: 1 records');

  rendered.rerender(
    <Activity mode="hidden">
      <PageSize label="first" />
    </Activity>,
  );

  await store.records.create({ kind: 'owner_message', message: { text: 'The tea is ready.' } });

  rendered.rerender(
    <>
      <Activity mode="hidden">
        <PageSize label="first" />
      </Activity>
      <PageSize label="second" />
    </>,
  );

  await rendered.findByText('second: 2 records');

  rendered.rerender(
    <>
      <Activity mode="visible">
        <PageSize label="first" />
      </Activity>
      <PageSize label="second" />
    </>,
  );

  const first = await rendered.findByText('first: 2 records');

  expect(first).toBeVisible();
  expect(rendered.getByText('second: 2 records')).toBeVisible();
});

interface PageSizeProps {
  readonly label: string;
}

// shows how many records the conversation's page holds, with no live stream to add to them
function PageSize(props: PageSizeProps): ReactNode {
  const page = useConversationPage('conversation');

  return <p>{`${props.label}: ${page.data?.records.length ?? 0} records`}</p>;
}
