import { expect, mock, test } from 'bun:test';
import { waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { server } from '../mocks/node';
import { store } from '../mocks/store';
import { createDeviceSession } from '../test-utils/create-device-session';
import { render } from '../test-utils/render';
import { Conversation } from './conversation';

async function setupTest() {
  // the conversation renders only for a signed-in browser
  await createDeviceSession();

  return { user: userEvent.setup() };
}

test('it shows the conversation the API holds', async () => {
  await setupTest();
  await store.records.create({ kind: 'owner_message', message: { text: 'Is it raining?' } });
  await store.records.create({ kind: 'assistant_message', message: { text: 'Not yet.' } });

  const rendered = render(<Conversation thread="conversation" />);
  const list = await rendered.findByRole('list', { name: 'Conversation' });

  expect(list).toHaveTextContent('You Is it raining?nixie Not yet.');
});

test('it sends a message with a span for each way its text arrived', async () => {
  const ctx = await setupTest();
  const rendered = render(<Conversation thread="conversation" />);
  const textBox = await rendered.findByRole('textbox', { name: 'Message' });

  await ctx.user.type(textBox, 'see ');
  await ctx.user.paste('this link');
  await ctx.user.keyboard('{Enter}');

  await waitFor(() => {
    expect(store.records.count()).toBe(1);
  });
  expect(store.records.findFirst((query) => query.where({ kind: 'owner_message' }))).toMatchObject({
    message: {
      spans: [
        { end: 4, source: 'typed', start: 0 },
        { end: 13, source: 'pasted', start: 4 },
      ],
      text: 'see this link',
    },
    thread: 'conversation',
  });
});

test('it shows a reply that arrives on the live stream', async () => {
  await setupTest();

  const rendered = render(<Conversation thread="conversation" />);

  await rendered.findByRole('list', { name: 'Conversation' });
  await store.records.create({ kind: 'assistant_message', message: { text: 'Hello from nixie' } });

  const reply = await rendered.findByText('Hello from nixie');

  expect(reply).toBeInTheDocument();
});

test('it shows an unsent message as not sent', async () => {
  const ctx = await setupTest();

  server.use(http.post('*/rpc/conversation/send', () => HttpResponse.error()));

  const rendered = render(<Conversation thread="conversation" />);
  const textBox = await rendered.findByRole('textbox', { name: 'Message' });

  await ctx.user.type(textBox, 'hello{Enter}');

  const status = await rendered.findByRole('status');

  expect(status).toHaveTextContent('Not sent');
  expect(rendered.getByRole('list', { name: 'Conversation' })).toHaveTextContent('You hello');
});

test('it retries an unsent message with its first client message ID', async () => {
  const ctx = await setupTest();
  const attempted = mock<(body: unknown) => void>();

  server.use(
    http.post(
      '*/rpc/conversation/send',
      async (info) => {
        const body: unknown = await info.request.json();

        attempted(body);

        return HttpResponse.error();
      },
      { once: true },
    ),
  );

  const rendered = render(<Conversation thread="conversation" />);
  const textBox = await rendered.findByRole('textbox', { name: 'Message' });

  await ctx.user.type(textBox, 'hello{Enter}');

  const retry = await rendered.findByRole('button', { name: 'Retry' });

  await ctx.user.click(retry);
  await waitFor(() => {
    expect(store.records.count()).toBe(1);
  });

  expect(attempted).toHaveBeenCalledExactlyOnceWith({
    json: {
      clientMessageId: store.records.findFirst((query) => query.where({ kind: 'owner_message' }))
        ?.message?.clientMessageId,
      spans: [{ end: 5, source: 'typed', start: 0 }],
      text: 'hello',
      thread: 'conversation',
    },
  });
});

test('it sends an unsent message again after the page reloads', async () => {
  const ctx = await setupTest();

  server.use(http.post('*/rpc/conversation/send', () => HttpResponse.error(), { once: true }));

  const rendered = render(<Conversation thread="conversation" />);
  const textBox = await rendered.findByRole('textbox', { name: 'Message' });

  await ctx.user.type(textBox, 'hello{Enter}');
  await rendered.findByText('Not sent');
  rendered.unmount();
  render(<Conversation thread="conversation" />);

  await waitFor(() => {
    expect(
      store.records.findFirst((query) => query.where({ kind: 'owner_message' }))?.message?.text,
    ).toBe('hello');
  });
});
