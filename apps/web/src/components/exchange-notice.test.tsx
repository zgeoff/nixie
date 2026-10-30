import { expect, test } from 'bun:test';
import { render } from '../test-utils/render';
import { ExchangeNotice } from './exchange-notice';

test('it shows the hop-limit notice with a link that opens the exchange', () => {
  const rendered = render(
    <ExchangeNotice
      notice={{
        link: { label: 'Open the exchange', messageID: 'm7q2x9k4pa', taskID: 'p7hd2wq9zn' },
        text: 'Garden plan and Seed order exchanged 21 messages with no outside cause. New messages between them wait for the next one. Nothing is waiting on you.',
      }}
    />,
  );

  expect(rendered.getByRole('note')).toHaveTextContent(
    'Garden plan and Seed order exchanged 21 messages with no outside cause. New messages between them wait for the next one. Nothing is waiting on you. Open the exchange',
  );

  expect(rendered.getByRole('link', { name: 'Open the exchange' })).toHaveAttribute(
    'href',
    '/tasks/p7hd2wq9zn#task-message-m7q2x9k4pa',
  );
});

test('it opens an exchange with the conversation on the conversation page', () => {
  const rendered = render(
    <ExchangeNotice
      notice={{
        link: { label: 'Open the exchange', messageID: 'm7q2x9k4pa', taskID: 'conversation' },
        text: 'Garden plan and Conversation exchanged 21 messages with no outside cause.',
      }}
    />,
  );

  expect(rendered.getByRole('link', { name: 'Open the exchange' })).toHaveAttribute(
    'href',
    '/#task-message-m7q2x9k4pa',
  );
});
