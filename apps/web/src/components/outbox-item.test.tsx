import { expect, test } from 'bun:test';
import { render } from '../test-utils/render';
import { OutboxItem } from './outbox-item';

const message = {
  clientMessageId: '4e6a8c0b-2d4f-4a6c-8e0b-3d5f7a9c1e24',
  spans: [],
  text: 'Return the library books.',
  thread: 'conversation',
};

test('it shows a send that tries again after failing as retrying', () => {
  const rendered = render(
    <OutboxItem
      entry={{ failures: 2, message, status: 'sending' }}
      onDiscard={() => {}}
      onRetry={() => Promise.resolve()}
    />,
  );

  expect(rendered.getByRole('status')).toHaveTextContent('Retrying…');
});

test('it shows when a failed send tries again on its own, beside the Retry button', () => {
  const rendered = render(
    <OutboxItem
      entry={{ failures: 1, message, retryAt: Date.now() + 7500, status: 'failed' }}
      onDiscard={() => {}}
      onRetry={() => Promise.resolve()}
    />,
  );

  expect(rendered.getByRole('status')).toHaveTextContent('Not sent · next try in 8 s');
  expect(rendered.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
});

test('it shows a refused send as not sent with only the Retry button', () => {
  const rendered = render(
    <OutboxItem
      entry={{ message, status: 'failed' }}
      onDiscard={() => {}}
      onRetry={() => Promise.resolve()}
    />,
  );

  expect(rendered.getByRole('status')).toHaveTextContent(/^Not sent$/u);

  expect(rendered.getAllByRole('button').map((button) => button.textContent)).toStrictEqual([
    'Retry',
  ]);
});
