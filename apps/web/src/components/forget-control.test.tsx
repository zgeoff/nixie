import { expect, mock, test } from 'bun:test';
import { waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { server } from '../mocks/server';
import { store } from '../mocks/store';
import { createDeviceSession } from '../test-utils/create-device-session';
import { render } from '../test-utils/render';
import { ForgetControl } from './forget-control';

function setupTest() {
  return { user: userEvent.setup() };
}

test('it forgets the message only once you confirm', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  const onForgotten = mock<() => void>();
  const onOpenChange = mock<(isOpen: boolean) => void>();

  const stored = await store.records.create({
    kind: 'owner_message',
    message: { text: 'The shed code is 4417.' },
  });

  const rendered = render(
    <ForgetControl
      hasText
      onForgotten={onForgotten}
      onOpenChange={onOpenChange}
      kind="owner_message"
      label="Forget"
      sequence={stored.sequence}
      thread={stored.thread}
    />,
  );

  await ctx.user.click(rendered.getByRole('button', { name: 'Forget' }));

  const asked = store.records.findFirst((query) => query.where({ sequence: stored.sequence }));

  await ctx.user.click(rendered.getByRole('button', { name: 'Forget for good' }));

  await waitFor(() => {
    expect(onForgotten).toHaveBeenCalledOnce();
  });

  expect(asked?.message?.text).toBe('The shed code is 4417.');
  expect(onOpenChange.mock.calls).toStrictEqual([[true], [false]]);

  expect(store.records.findFirst((query) => query.where({ sequence: stored.sequence }))).toSatisfy(
    (record: unknown) => typeof record === 'object' && record !== null && !('message' in record),
  );
});

test('it asks to forget a reply by its name', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  const stored = await store.records.create({ kind: 'model.reply', message: { text: 'Noted.' } });

  const rendered = render(
    <ForgetControl
      hasText
      kind="model.reply"
      label="Forget"
      onForgotten={() => {}}
      onOpenChange={() => {}}
      sequence={stored.sequence}
      thread={stored.thread}
    />,
  );

  await ctx.user.click(rendered.getByRole('button', { name: 'Forget' }));

  expect(rendered.getByRole('group', { name: 'Forget this reply' })).toBeVisible();
});

test('it keeps the message when you choose to keep it', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  const onForgotten = mock<() => void>();
  const onOpenChange = mock<(isOpen: boolean) => void>();

  const stored = await store.records.create({
    kind: 'owner_message',
    message: { text: 'The shed code is 4417.' },
  });

  const rendered = render(
    <ForgetControl
      hasText
      onForgotten={onForgotten}
      onOpenChange={onOpenChange}
      kind="owner_message"
      label="Forget"
      sequence={stored.sequence}
      thread={stored.thread}
    />,
  );

  await ctx.user.click(rendered.getByRole('button', { name: 'Forget' }));
  await ctx.user.click(rendered.getByRole('button', { name: 'Keep' }));

  const kept = store.records.findFirst((query) => query.where({ sequence: stored.sequence }));

  expect(rendered.getByRole('button', { name: 'Forget' })).toBeVisible();
  expect(kept?.message?.text).toBe('The shed code is 4417.');
  expect(onOpenChange.mock.calls).toStrictEqual([[true], [false]]);
  expect(onForgotten).not.toHaveBeenCalled();
});

test('it shows no control for a message with no text and no forget of its own', () => {
  const rendered = render(
    <ForgetControl
      hasText={false}
      kind="owner_message"
      label="Forget"
      onForgotten={() => {}}
      onOpenChange={() => {}}
      sequence={1}
      thread="conversation"
    />,
  );

  expect(rendered.container).toBeEmptyDOMElement();
});

test('it says so when the forget fails', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  const onForgotten = mock<() => void>();
  const onOpenChange = mock<(isOpen: boolean) => void>();

  const stored = await store.records.create({
    kind: 'owner_message',
    message: { text: 'The shed code is 4417.' },
  });

  server.use(
    http.post('*/rpc/conversation/forget', () =>
      HttpResponse.json({ code: 'INTERNAL_SERVER_ERROR' }, { status: 500 }),
    ),
  );

  const rendered = render(
    <ForgetControl
      hasText
      kind="owner_message"
      label="Forget"
      onForgotten={onForgotten}
      onOpenChange={onOpenChange}
      sequence={stored.sequence}
      thread={stored.thread}
    />,
  );

  await ctx.user.click(rendered.getByRole('button', { name: 'Forget' }));

  const target = await rendered.findByRole('button', { name: 'Forget for good' });

  await ctx.user.click(target);

  const alert = await rendered.findByRole('alert');

  expect(alert).toHaveTextContent('The forget did not finish. Try again.');
  expect(onForgotten).not.toHaveBeenCalled();
  expect(onOpenChange.mock.calls).toStrictEqual([[true]]);
});

test('it shows what the forget removes before the confirm, and forgets nothing until you confirm', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  const stored = await store.records.create({
    kind: 'owner_message',
    message: { text: 'The shed code is 4417.' },
  });

  await store.moments.create({ firstSequence: stored.sequence, lastSequence: stored.sequence });
  await store.moments.create({ firstSequence: stored.sequence, lastSequence: stored.sequence });

  await store.memoryItems.create({
    versions: [
      {
        evidence: { end: 5, sequence: stored.sequence, start: 0 },
        text: 'The shed code is on the key ring',
      },
    ],
  });

  const rendered = render(
    <ForgetControl
      hasText
      kind="owner_message"
      label="Forget"
      onForgotten={() => {}}
      onOpenChange={() => {}}
      sequence={stored.sequence}
      thread={stored.thread}
    />,
  );

  await ctx.user.click(rendered.getByRole('button', { name: 'Forget' }));

  const items = await rendered.findByRole('list', { name: 'Memory items that quote it' });

  const group = rendered.getByRole('group', { name: 'Forget this message' });

  expect(group).toHaveTextContent('It is part of 2 moments.');
  expect(items).toHaveTextContent('The shed code is on the key ring');

  expect(group).toHaveTextContent(
    "These memories stay, but lose their edit history, their quotes of this message, and any suggested changes you haven't answered.",
  );

  expect(
    store.records.findFirst((query) => query.where({ sequence: stored.sequence }))?.message?.text,
  ).toBe('The shed code is 4417.');
});

test('it words no memory sentence when no memory item quotes the record', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  const stored = await store.records.create({
    kind: 'model.reply',
    message: { text: 'Noted.' },
  });

  const rendered = render(
    <ForgetControl
      hasText
      kind="model.reply"
      label="Forget"
      onForgotten={() => {}}
      onOpenChange={() => {}}
      sequence={stored.sequence}
      thread={stored.thread}
    />,
  );

  await ctx.user.click(rendered.getByRole('button', { name: 'Forget' }));

  const group = await rendered.findByRole('group', { name: 'Forget this reply' });

  await rendered.findByText('No memory item quotes it.');

  expect(group).not.toHaveTextContent('These memories stay');
});

test('it shows an error in place of the confirm when the preview fails, and never forgets', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  const forgotten = mock<() => void>();

  const stored = await store.records.create({
    kind: 'owner_message',
    message: { text: 'The shed code is 4417.' },
  });

  server.use(
    http.post('*/rpc/conversation/previewForget', () =>
      HttpResponse.json({ code: 'INTERNAL_SERVER_ERROR' }, { status: 500 }),
    ),
    http.post('*/rpc/conversation/forget', () => {
      forgotten();

      return HttpResponse.json({ code: 'INTERNAL_SERVER_ERROR' }, { status: 500 });
    }),
  );

  const rendered = render(
    <ForgetControl
      hasText
      kind="owner_message"
      label="Forget"
      onForgotten={() => {}}
      onOpenChange={() => {}}
      sequence={stored.sequence}
      thread={stored.thread}
    />,
  );

  await ctx.user.click(rendered.getByRole('button', { name: 'Forget' }));

  const alert = await rendered.findByRole('alert');

  expect(alert).toHaveTextContent('The forget could not read what it removes.');
  expect(rendered.queryByRole('button')).toBeNull();
  expect(forgotten).not.toHaveBeenCalled();
});
