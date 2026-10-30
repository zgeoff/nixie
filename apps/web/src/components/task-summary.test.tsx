import { expect, test } from 'bun:test';
import { buildMockListedTask } from '../test-utils/build-mock-listed-task';
import { render } from '../test-utils/render';
import { TaskSummary } from './task-summary';

test('it links a task to its page with its state, brief and the task it waits on', () => {
  const garden = buildMockListedTask({
    brief: 'Plans the vegetable beds.',
    name: 'Garden plan',
    state: 'waiting',
    taskID: 'k3vq8m2xpa',
    waitingOn: 'conversation',
  });

  const conversation = buildMockListedTask({ name: 'Conversation', taskID: 'conversation' });
  const rendered = render(<TaskSummary isLinked task={garden} tasks={[garden, conversation]} />);

  expect(rendered.getByRole('link', { name: 'Garden plan' })).toHaveAttribute(
    'href',
    '/tasks/k3vq8m2xpa',
  );

  expect(rendered.getByText('Waiting')).toBeVisible();
  expect(rendered.getByText('Plans the vegetable beds.')).toBeVisible();
  expect(rendered.getByText('Waiting on Conversation')).toBeVisible();
});

test('it counts the queued and started actions of a task', () => {
  const garden = buildMockListedTask({
    actions: { cancelled: 4, queued: 2, started: 1 },
    name: 'Garden plan',
  });

  const rendered = render(<TaskSummary isLinked={false} task={garden} tasks={[garden]} />);

  expect(rendered.getByText('Actions: 2 queued, 1 started')).toBeVisible();
  expect(rendered.queryByRole('link')).toBeNull();
});

test('it names the tasks that wait on this one', () => {
  const garden = buildMockListedTask({ name: 'Garden plan', taskID: 'k3vq8m2xpa' });

  const seeds = buildMockListedTask({
    name: 'Seed order',
    taskID: 'p7hd2wq9zn',
    waitingOn: 'k3vq8m2xpa',
  });

  const rendered = render(<TaskSummary isLinked task={garden} tasks={[garden, seeds]} />);

  expect(rendered.getByText('Seed order is waiting on this task')).toBeVisible();
});
