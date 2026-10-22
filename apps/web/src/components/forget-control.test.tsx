import { expect, mock, test } from 'bun:test';
import { waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { store } from '../mocks/store';
import { toLogRecord } from '../mocks/to-log-record';
import { buildMockLogRecord } from '../test-utils/build-mock-log-record';
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

  const stored = await store.records.create({
    kind: 'owner_message',
    message: { text: 'The shed code is 4417.' },
  });

  const rendered = render(
    <ForgetControl hasText onForgotten={onForgotten} record={toLogRecord(stored)} />,
  );

  await ctx.user.click(rendered.getByRole('button', { name: 'Forget' }));

  const asked = store.records.findFirst((query) => query.where({ sequence: stored.sequence }));

  await ctx.user.click(rendered.getByRole('button', { name: 'Forget for good' }));

  await waitFor(() => {
    expect(onForgotten).toHaveBeenCalledOnce();
  });

  expect(asked?.message?.text).toBe('The shed code is 4417.');

  expect(store.records.findFirst((query) => query.where({ sequence: stored.sequence }))).toSatisfy(
    (record: unknown) => typeof record === 'object' && record !== null && !('message' in record),
  );
});

test('it asks to forget a reply by its name', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  const rendered = render(
    <ForgetControl
      hasText
      onForgotten={() => {}}
      record={buildMockLogRecord({ kind: 'model.reply', message: { text: 'Noted.' } })}
    />,
  );

  await ctx.user.click(rendered.getByRole('button', { name: 'Forget' }));

  expect(rendered.getByRole('group', { name: 'Forget this reply' })).toBeVisible();
});

test('it keeps the message when you choose to keep it', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  const onForgotten = mock<() => void>();

  const stored = await store.records.create({
    kind: 'owner_message',
    message: { text: 'The shed code is 4417.' },
  });

  const rendered = render(
    <ForgetControl hasText onForgotten={onForgotten} record={toLogRecord(stored)} />,
  );

  await ctx.user.click(rendered.getByRole('button', { name: 'Forget' }));
  await ctx.user.click(rendered.getByRole('button', { name: 'Keep' }));

  const kept = store.records.findFirst((query) => query.where({ sequence: stored.sequence }));

  expect(rendered.getByRole('button', { name: 'Forget' })).toBeVisible();
  expect(kept?.message?.text).toBe('The shed code is 4417.');
  expect(onForgotten).not.toHaveBeenCalled();
});

test('it shows no control for a message with no text and no forget of its own', () => {
  const rendered = render(
    <ForgetControl
      hasText={false}
      onForgotten={() => {}}
      record={buildMockLogRecord({ kind: 'owner_message' })}
    />,
  );

  expect(rendered.container).toBeEmptyDOMElement();
});

test('it says so when the forget fails', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  const onForgotten = mock<() => void>();

  const rendered = render(
    <ForgetControl
      hasText
      onForgotten={onForgotten}
      record={buildMockLogRecord({
        kind: 'owner_message',
        message: { text: 'The shed code is 4417.' },
        sequence: 404,
        thread: 'conversation',
      })}
    />,
  );

  await ctx.user.click(rendered.getByRole('button', { name: 'Forget' }));
  await ctx.user.click(rendered.getByRole('button', { name: 'Forget for good' }));

  const alert = await rendered.findByRole('alert');

  expect(alert).toHaveTextContent('The forget did not finish. Try again.');
  expect(onForgotten).not.toHaveBeenCalled();
});
