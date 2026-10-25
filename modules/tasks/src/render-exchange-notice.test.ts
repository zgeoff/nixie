import { expect, test } from 'bun:test';
import { renderExchangeNotice } from './render-exchange-notice';

test('it tells the owner who waits on whom in an exchange that reached the limit', () => {
  expect(
    renderExchangeNotice(
      {
        directory: [
          { taskID: 'planner', name: 'Planner', brief: 'Plans the week.', isWokenByMessages: true },
          {
            taskID: 'conversation',
            name: 'Conversation',
            brief: 'Talks.',
            isWokenByMessages: true,
          },
        ],
      },
      {
        messageID: 'k3vq8m2xpa',
        stepKey: 'planner:21',
        from: 'planner',
        to: 'conversation',
        hops: 20,
        waiting: { taskID: 'planner', onTaskID: 'conversation' },
      },
    ),
  ).toStrictEqual({
    text: 'Planner and Conversation exchanged 20 messages with no outside cause. New messages between them wait for the next one. Planner is waiting on Conversation.',
    link: { label: 'Open the exchange', messageID: 'k3vq8m2xpa' },
  });
});

test('it tells the owner nothing waits on them when no question is open', () => {
  expect(
    renderExchangeNotice(
      {
        directory: [
          { taskID: 'planner', name: 'Planner', brief: 'Plans the week.', isWokenByMessages: true },
        ],
      },
      {
        messageID: 'k3vq8m2xpa',
        stepKey: 'planner:21',
        from: 'planner',
        to: 'critic',
        hops: 20,
        waiting: null,
      },
    ).text,
  ).toBe(
    'Planner and critic exchanged 20 messages with no outside cause. New messages between them wait for the next one. Nothing is waiting on you.',
  );
});
