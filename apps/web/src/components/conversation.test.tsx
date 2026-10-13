import { expect, mock, test } from 'bun:test';
import { waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, delay, http } from 'msw';
import { server } from '../mocks/node';
import { store } from '../mocks/store';
import { createDeviceSession } from '../test-utils/create-device-session';
import { render } from '../test-utils/render';
import { setupBrowserTimeZone } from '../test-utils/setup-browser-time-zone';
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

test('it folds the records of a step into one line between the messages', async () => {
  await setupTest();
  await store.records.create({ kind: 'owner_message', message: { text: 'Rain?' } });
  await store.records.create({
    kind: 'task.step_started',
    recordedAt: new Date(0),
    task: { stepKey: 'step-1', taskID: 'conversation' },
  });
  await store.records.create({
    kind: 'tool_called',
    toolCall: { callID: 'call-1', input: { url: 'https://weather.test/' }, tool: 'web_fetch' },
  });
  await store.records.create({
    kind: 'tool_result',
    toolCall: { callID: 'call-1', content: { result: { text: 'dry' } }, outcome: 'result' },
  });
  await store.records.create({ kind: 'model.reply', message: { text: 'Not yet.' } });
  await store.records.create({ kind: 'task.step_committed', recordedAt: new Date(4200) });

  const rendered = render(<Conversation thread="conversation" />);
  const list = await rendered.findByRole('list', { name: 'Conversation' });

  expect(
    [...list.children].map(
      (item) => item.querySelector('summary')?.textContent ?? item.textContent,
    ),
  ).toStrictEqual(['You Rain?', 'conversation · web fetch: weather.test · 4.2s', 'nixie Not yet.']);
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

test('it shows a spinner while a reply is pending and removes it when the reply arrives', async () => {
  const ctx = await setupTest();
  const rendered = render(<Conversation thread="conversation" />);
  const textBox = await rendered.findByRole('textbox', { name: 'Message' });

  await ctx.user.type(textBox, 'Is it raining?{Enter}');

  const spinner = await rendered.findByRole('progressbar', { name: 'nixie is working' });

  await store.records.create({ kind: 'assistant_message', message: { text: 'Not yet.' } });
  await rendered.findByText('Not yet.');

  expect(spinner).not.toBeInTheDocument();
  expect(rendered.queryByRole('progressbar', { name: 'nixie is working' })).toBeNull();
});

// The client pauses 1 s and then 2 s between the three attempts, on the platform timer.
test('it says live updates are unavailable while the live stream keeps failing', async () => {
  await setupTest();
  server.use(http.post('*/rpc/records/follow', () => HttpResponse.error()));

  const rendered = render(<Conversation thread="conversation" />);
  const notice = await rendered.findByRole('status', {}, { timeout: 8000 });

  expect(notice).toHaveTextContent('Live updates unavailable');
}, 10_000);

test('it clears the failure notice once a turn succeeds', async () => {
  await setupTest();
  await store.records.create({ kind: 'owner_message', message: { text: 'Is it raining?' } });
  await store.records.create({
    kind: 'task.step_errored',
    task: {
      errorLimit: 3,
      errors: 3,
      retryAt: new Date('2026-10-14T09:04:00Z'),
      stepKey: 'conversation:1',
      taskID: 'conversation',
    },
  });

  const rendered = render(<Conversation thread="conversation" />);

  await rendered.findByRole('alert');
  await store.records.create({ kind: 'model.reply', message: { text: 'Not yet.' } });
  await store.records.create({
    kind: 'task.step_committed',
    task: { stepKey: 'conversation:1', taskID: 'conversation' },
  });

  await waitFor(() => {
    expect(rendered.queryByRole('alert')).toBeNull();
  });
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

  setupBrowserTimeZone('Europe/Lisbon');
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
      timeZone: 'Europe/Lisbon',
    },
  });
});

test('it sends an unsent message again after the page reloads, with its first ID', async () => {
  const ctx = await setupTest();

  server.use(http.post('*/rpc/conversation/send', () => HttpResponse.error(), { once: true }));

  const rendered = render(<Conversation thread="conversation" />);
  const textBox = await rendered.findByRole('textbox', { name: 'Message' });

  await ctx.user.type(textBox, 'hello{Enter}');

  const stored = globalThis.localStorage.getItem('nixie.outbox');

  rendered.unmount();
  render(<Conversation thread="conversation" />);
  await waitFor(() => {
    expect(store.records.count()).toBe(1);
  });

  expect(stored).toInclude(
    store.records.findFirst((query) => query.where({ kind: 'owner_message' }))?.message
      ?.clientMessageId ?? 'no record',
  );
});

test('it sends stored messages in the order you sent them', async () => {
  await setupTest();
  globalThis.localStorage.setItem(
    'nixie.outbox',
    JSON.stringify([
      {
        clientMessageId: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
        spans: [{ end: 5, source: 'typed', start: 0 }],
        text: 'first',
        thread: 'conversation',
      },
      {
        clientMessageId: '0b9d6c1e-2f4a-4e7b-9c3d-8a5f1e2b7c64',
        spans: [{ end: 6, source: 'typed', start: 0 }],
        text: 'second',
        thread: 'conversation',
      },
    ]),
  );

  // the first send is slow, so a client that sends both at once writes the second one first
  server.use(
    http.post(
      '*/rpc/conversation/send',
      async () => {
        await delay(50);
      },
      { once: true },
    ),
  );
  render(<Conversation thread="conversation" />);
  await waitFor(() => {
    expect(store.records.count()).toBe(2);
  });

  expect(
    store.records
      .findMany((query) => query.where({ kind: 'owner_message' }), { orderBy: { sequence: 'asc' } })
      .map((record) => record.message?.text),
  ).toStrictEqual(['first', 'second']);
});

test('it keeps a message that another tab left unsent', async () => {
  const ctx = await setupTest();
  const rendered = render(<Conversation thread="conversation" />);
  const textBox = await rendered.findByRole('textbox', { name: 'Message' });

  globalThis.localStorage.setItem(
    'nixie.outbox',
    JSON.stringify([
      {
        clientMessageId: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
        spans: [{ end: 10, source: 'typed', start: 0 }],
        text: 'other tab',
        thread: 'conversation',
      },
    ]),
  );
  await ctx.user.type(textBox, 'hello{Enter}');
  await waitFor(() => {
    expect(store.records.count()).toBe(1);
  });

  expect(globalThis.localStorage.getItem('nixie.outbox')).toInclude(
    '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
  );
});
