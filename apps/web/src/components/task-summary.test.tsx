import { expect, test } from 'bun:test';
import userEvent from '@testing-library/user-event';
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

test('it opens the whole brief of a task on the task’s own page', async () => {
  const user = userEvent.setup();

  const garden = buildMockListedTask({
    brief:
      'Plan the vegetable beds for spring.\nPut the beans along the north fence, and keep the tomatoes out of the shade of the shed.',
    name: 'Garden plan',
  });

  const rendered = render(<TaskSummary isLinked={false} task={garden} tasks={[garden]} />);

  await user.click(rendered.getByRole('button', { name: 'Show the whole prompt' }));

  const toggle = rendered.getByRole('button', { name: 'Show less of the prompt' });

  expect(toggle).toHaveAttribute('aria-expanded', 'true');

  expect(
    document.querySelector(`[id="${toggle.getAttribute('aria-controls')}"]`),
  ).toHaveTextContent(
    'Plan the vegetable beds for spring. Put the beans along the north fence, and keep the tomatoes out of the shade of the shed.',
  );
});

test('it offers no whole brief on the dashboard', () => {
  const garden = buildMockListedTask({ brief: 'Plans the vegetable beds.', name: 'Garden plan' });
  const rendered = render(<TaskSummary isLinked task={garden} tasks={[garden]} />);

  expect(rendered.queryByRole('button', { name: 'Show the whole prompt' })).toBeNull();
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
