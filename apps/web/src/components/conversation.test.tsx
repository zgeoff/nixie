import { expect, mock, test } from 'bun:test';
import { waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, delay, http } from 'msw';
import invariant from 'tiny-invariant';
import { server } from '../mocks/node';
import { store } from '../mocks/store';
import { buildStubTimer } from '../test-utils/build-stub-timer';
import { createDeviceSession } from '../test-utils/create-device-session';
import { render } from '../test-utils/render';
import { setupBrowserTimeZone } from '../test-utils/setup-browser-time-zone';
import { Conversation } from './conversation';

function setupTest() {
  return { user: userEvent.setup(), timer: buildStubTimer() };
}

test('it shows the conversation the API holds', async () => {
  await createDeviceSession();

  await store.records.create({ kind: 'owner_message', message: { text: 'Is it raining?' } });
  await store.records.create({ kind: 'assistant_message', message: { text: 'Not yet.' } });

  const rendered = render(<Conversation thread="conversation" />);

  const list = await rendered.findByRole('list', { name: 'Conversation' });

  expect(list).toHaveTextContent('You Is it raining?Forgetnixie Not yet.');
});

test('it folds the records of a step into one line between the messages', async () => {
  await createDeviceSession();

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
  ).toStrictEqual([
    'You Rain?Forget',
    'conversation · web fetch: weather.test · 4.2s',
    'nixie Not yet.Forget',
  ]);
});

test('it labels a fetch by link ID with the page the fetch returned', async () => {
  await createDeviceSession();

  await store.records.create({
    kind: 'task.step_started',
    recordedAt: new Date(0),
    task: { stepKey: 'step-1', taskID: 'conversation' },
  });

  await store.records.create({
    kind: 'tool_called',
    toolCall: { callID: 'call-1', input: { link: 'L7' }, tool: 'web_fetch' },
  });

  await store.records.create({
    kind: 'tool_result',
    toolCall: {
      callID: 'call-1',
      content: { result: { text: 'calm', url: 'https://www.harbour.test/tides/today' } },
      outcome: 'result',
    },
  });

  await store.records.create({ kind: 'task.step_committed', recordedAt: new Date(1500) });

  const rendered = render(<Conversation thread="conversation" />);

  const summary = await rendered.findByText(
    'conversation · web fetch: harbour.test/tides/today · 1.5s',
  );

  expect(summary).toBeVisible();
});

test('it sends a message with a span for each way its text arrived', async () => {
  const ctx = setupTest();

  await createDeviceSession();

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
  await createDeviceSession();

  const rendered = render(<Conversation thread="conversation" />);

  await rendered.findByRole('list', { name: 'Conversation' });
  await store.records.create({ kind: 'assistant_message', message: { text: 'Hello from nixie' } });

  const reply = await rendered.findByText('Hello from nixie');

  expect(reply).toBeInTheDocument();
});

test('it shows a spinner while a reply is pending and removes it when the reply arrives', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  const rendered = render(<Conversation thread="conversation" />);

  const textBox = await rendered.findByRole('textbox', { name: 'Message' });

  await ctx.user.type(textBox, 'Is it raining?{Enter}');

  const spinner = await rendered.findByRole('progressbar', { name: 'nixie is working' });

  await store.records.create({ kind: 'assistant_message', message: { text: 'Not yet.' } });
  await rendered.findByText('Not yet.');

  expect(spinner).not.toBeInTheDocument();
  expect(rendered.queryByRole('progressbar', { name: 'nixie is working' })).toBeNull();
});

test('it drops the messages from before a reset that arrives on the live stream and marks the reset', async () => {
  await createDeviceSession();

  setupBrowserTimeZone('Europe/Lisbon');

  await store.records.create({ kind: 'owner_message', message: { text: 'Is the kettle on?' } });
  await store.records.create({ kind: 'assistant_message', message: { text: 'It is now.' } });

  const rendered = render(<Conversation thread="conversation" />);

  const list = await rendered.findByRole('list', { name: 'Conversation' });

  await rendered.findByText('It is now.');

  server.use(http.post('*/rpc/conversation/read', () => new HttpResponse(null, { status: 503 })));

  await store.records.create({
    kind: 'log_reset',
    recordedAt: new Date('2026-10-12T09:30:00Z'),
  });

  await rendered.findByRole('note', { name: 'reset' });

  expect([...list.children].map((item) => item.textContent)).toStrictEqual([
    'Reset at Oct 12, 10:30 AM',
  ]);
});

test('it drops a message this tab sent before a reset and stops working', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  server.use(
    http.post('*/rpc/conversation/send', async () => {
      await delay('infinite');
    }),
  );

  const rendered = render(<Conversation thread="conversation" />);

  const textBox = await rendered.findByRole('textbox', { name: 'Message' });

  await ctx.user.type(textBox, 'Is the gate locked?{Enter}');
  await rendered.findByText('Is the gate locked?');
  await rendered.findByRole('progressbar', { name: 'nixie is working' });
  await store.records.create({ kind: 'log_reset', recordedAt: new Date() });
  await rendered.findByRole('note', { name: 'reset' });

  await waitFor(() => {
    expect(rendered.queryByText('Is the gate locked?')).toBeNull();
  });

  expect(rendered.queryByRole('progressbar', { name: 'nixie is working' })).toBeNull();
});

test('it keeps a message this tab sends after a reset while its clock runs behind the server', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  const rendered = render(<Conversation thread="conversation" />);

  const textBox = await rendered.findByRole('textbox', { name: 'Message' });

  await store.records.create({ kind: 'log_reset', recordedAt: new Date(Date.now() + 60_000) });
  await rendered.findByRole('note', { name: 'reset' });
  await ctx.user.type(textBox, 'Is the gate locked?{Enter}');

  await waitFor(() => {
    expect(
      store.records.findFirst((query) =>
        query.where((record) => record.message?.text === 'Is the gate locked?'),
      ),
    ).toBeDefined();
  });

  const list = await rendered.findByRole('list', { name: 'Conversation' });

  await waitFor(() => {
    expect(list).toHaveTextContent('Is the gate locked?');
  });
});

test('it says live updates are unavailable while the live stream keeps failing', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  server.use(http.post('*/rpc/records/follow', () => HttpResponse.error()));

  const rendered = render(<Conversation thread="conversation" startTimer={ctx.timer.startTimer} />);

  await ctx.timer.advanceToNext();
  await ctx.timer.advanceToNext();

  const notice = await rendered.findByRole('status');

  expect(notice).toHaveTextContent('Live updates unavailable');
});

test('it clears the failure notice once a turn succeeds', async () => {
  await createDeviceSession();

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

test('it drops the failure notice of a step a reset removed while the read after the reset fails', async () => {
  await createDeviceSession();

  await store.records.create({ kind: 'owner_message', message: { text: 'Is the gate shut?' } });

  await store.records.create({
    kind: 'task.step_errored',
    task: {
      errorLimit: 3,
      errors: 3,
      retryAt: new Date('2026-10-15T11:20:00Z'),
      stepKey: 'conversation:1',
      taskID: 'conversation',
    },
  });

  const rendered = render(<Conversation thread="conversation" />);

  await rendered.findByRole('alert');

  server.use(http.post('*/rpc/conversation/read', () => new HttpResponse(null, { status: 503 })));
  store.records.clear();

  await store.records.create({ kind: 'log_reset' });
  await rendered.findByRole('note', { name: 'reset' });

  expect(rendered.queryByRole('alert')).toBeNull();
});

test('it shows the failure notice of a step that fails after a reset', async () => {
  await createDeviceSession();

  await store.records.create({ kind: 'owner_message', message: { text: 'Is the gate shut?' } });

  const rendered = render(<Conversation thread="conversation" />);

  await rendered.findByText('Is the gate shut?');

  server.use(http.post('*/rpc/conversation/read', () => new HttpResponse(null, { status: 503 })));
  store.records.clear();

  await store.records.create({ kind: 'log_reset' });
  await rendered.findByRole('note', { name: 'reset' });

  await store.records.create({
    kind: 'task.step_errored',
    task: {
      errorLimit: 3,
      errors: 3,
      retryAt: new Date('2026-10-15T11:20:00Z'),
      stepKey: 'conversation:2',
      taskID: 'conversation',
    },
  });

  const alert = await rendered.findByRole('alert');

  expect(alert).toHaveTextContent(/^nixie failed to answer 3 times in a row\./u);
});

test('it keeps a failed forget and its retry once the forget start drops the text', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  const message = await store.records.create({
    kind: 'owner_message',
    message: { text: 'The shed code is 4417.' },
  });

  server.use(
    http.post('*/rpc/conversation/forget', async () => {
      await store.records.create({
        forget: { sequence: message.sequence },
        kind: 'record.forget_started',
      });

      return HttpResponse.error();
    }),
  );

  const rendered = render(<Conversation thread="conversation" />);

  const forget = await rendered.findByRole('button', { name: 'Forget' });

  await ctx.user.click(forget);
  await ctx.user.click(rendered.getByRole('button', { name: 'Forget for good' }));

  await waitFor(() => {
    expect(rendered.getByText('Forgotten')).toBeVisible();
    expect(rendered.getByText('The forget did not finish. Try again.')).toBeVisible();
  });

  expect(rendered.getByRole('button', { name: 'Forget for good' })).toBeEnabled();
});

test('it finishes a failed forget when you confirm it again', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  const message = await store.records.create({
    kind: 'owner_message',
    message: { text: 'The shed code is 4417.' },
  });

  server.use(http.post('*/rpc/conversation/forget', () => HttpResponse.error(), { once: true }));

  const rendered = render(<Conversation thread="conversation" />);

  const forget = await rendered.findByRole('button', { name: 'Forget' });

  await ctx.user.click(forget);
  await ctx.user.click(rendered.getByRole('button', { name: 'Forget for good' }));
  await rendered.findByText('The forget did not finish. Try again.');
  await ctx.user.click(rendered.getByRole('button', { name: 'Forget for good' }));

  await waitFor(() => {
    expect(rendered.queryByRole('group', { name: 'Forget this message' })).toBeNull();

    expect(
      store.records.findFirst((query) => query.where({ sequence: message.sequence })),
    ).toSatisfy(
      (record: unknown) => typeof record === 'object' && record !== null && !('message' in record),
    );
  });
});

test('it never shows the text of a message you sent and then forgot', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  const rendered = render(<Conversation thread="conversation" />);

  const textBox = await rendered.findByRole('textbox', { name: 'Message' });

  await ctx.user.type(textBox, 'The gate code is 2290.{Enter}');
  await rendered.findByRole('button', { name: 'Forget' }).then((forget) => ctx.user.click(forget));
  await ctx.user.click(rendered.getByRole('button', { name: 'Forget for good' }));

  await waitFor(() => {
    expect(rendered.queryByRole('group', { name: 'Forget this message' })).toBeNull();
  });

  expect(rendered.getByRole('list', { name: 'Conversation' })).toHaveTextContent('You Forgotten');
  expect(rendered.queryByText('The gate code is 2290.')).toBeNull();
  expect(rendered.queryByRole('status')).toBeNull();
});

test('it shows an unsent message as not sent', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  server.use(http.post('*/rpc/conversation/send', () => HttpResponse.error()));

  const rendered = render(<Conversation thread="conversation" />);

  const textBox = await rendered.findByRole('textbox', { name: 'Message' });

  await ctx.user.type(textBox, 'hello{Enter}');

  const status = await rendered.findByRole('status');

  expect(status).toHaveTextContent('Not sent');
  expect(rendered.getByRole('list', { name: 'Conversation' })).toHaveTextContent('You hello');
});

test('it retries an unsent message with its first client message ID', async () => {
  const ctx = setupTest();

  await createDeviceSession();

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
  await rendered.findByRole('button', { name: 'Retry' }).then((retry) => ctx.user.click(retry));

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
      writtenAt: expect.toBeDateString(),
    },
  });
});

test('it sends an unsent message again after the page reloads, with its first ID', async () => {
  const ctx = setupTest();

  await createDeviceSession();

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
  await createDeviceSession();

  globalThis.localStorage.setItem(
    'nixie.outbox',
    JSON.stringify([
      {
        clientMessageId: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
        spans: [{ end: 5, source: 'typed', start: 0 }],
        text: 'first',
        thread: 'conversation',
        writtenAt: new Date().toISOString(),
      },
      {
        clientMessageId: '0b9d6c1e-2f4a-4e7b-9c3d-8a5f1e2b7c64',
        spans: [{ end: 6, source: 'typed', start: 0 }],
        text: 'second',
        thread: 'conversation',
        writtenAt: new Date().toISOString(),
      },
    ]),
  );

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

test('it sends a stored message written under 2 minutes ago, and holds an older one until you send it', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
  const halfAMinuteAgo = new Date(Date.now() - 30 * 1000).toISOString();

  globalThis.localStorage.setItem(
    'nixie.outbox',
    JSON.stringify([
      {
        clientMessageId: '6c1e3a5f-7b9d-4f2a-8c4e-0d2f4a6c8e17',
        spans: [{ end: 15, source: 'typed', start: 0 }],
        text: 'Lock the garage',
        thread: 'conversation',
        writtenAt: threeHoursAgo,
      },
      {
        clientMessageId: '1f3b5d7a-9c2e-4a6b-8d0f-2e4c6a8b0d39',
        spans: [{ end: 14, source: 'typed', start: 0 }],
        text: 'Order more tea',
        thread: 'conversation',
        writtenAt: halfAMinuteAgo,
      },
    ]),
  );

  const rendered = render(<Conversation thread="conversation" />);

  await waitFor(() => {
    expect(store.records.count()).toBe(1);
  });

  const held = await rendered.findByText('Lock the garage').then((text) => text.closest('li'));

  expect(
    store.records.findFirst((query) => query.where({ kind: 'owner_message' }))?.message?.text,
  ).toBe('Order more tea');

  expect(held).toHaveTextContent('Not sent · written 3 h ago');

  invariant(held, 'the held message shows in no list item');

  await ctx.user.click(within(held).getByRole('button', { name: 'Send' }));

  await waitFor(() => {
    expect(store.records.count()).toBe(2);
  });

  expect(
    store.records
      .findMany((query) => query.where({ kind: 'owner_message' }), { orderBy: { sequence: 'asc' } })
      .map((record) => record.message?.text),
  ).toStrictEqual(['Order more tea', 'Lock the garage']);
});

test('it holds a stored message from before the outbox kept when you wrote it', async () => {
  await createDeviceSession();

  globalThis.localStorage.setItem(
    'nixie.outbox',
    JSON.stringify([
      {
        clientMessageId: '6c1e3a5f-7b9d-4f2a-8c4e-0d2f4a6c8e17',
        spans: [{ end: 15, source: 'typed', start: 0 }],
        text: 'Lock the garage',
        thread: 'conversation',
        timeZone: 'Europe/Lisbon',
      },
    ]),
  );

  const rendered = render(<Conversation thread="conversation" />);

  const status = await rendered.findByText(/^Not sent/u);

  expect(status).toHaveTextContent('Not sent · written earlier');
  expect(rendered.getByRole('button', { name: 'Discard' })).toBeInTheDocument();
  expect(store.records.count()).toBe(0);
});

test('it removes a held message you discard from the page and device storage', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();

  globalThis.localStorage.setItem(
    'nixie.outbox',
    JSON.stringify([
      {
        clientMessageId: '6c1e3a5f-7b9d-4f2a-8c4e-0d2f4a6c8e17',
        spans: [{ end: 15, source: 'typed', start: 0 }],
        text: 'Lock the garage',
        thread: 'conversation',
        writtenAt: tenMinutesAgo,
      },
    ]),
  );

  const rendered = render(<Conversation thread="conversation" />);

  const discard = await rendered.findByRole('button', { name: 'Discard' });

  await ctx.user.click(discard);

  await waitFor(() => {
    expect(rendered.queryByText('Lock the garage')).toBeNull();
  });

  expect(globalThis.localStorage.getItem('nixie.outbox')).toBeNull();
  expect(store.records.count()).toBe(0);
});
