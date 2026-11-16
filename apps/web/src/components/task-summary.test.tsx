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
  const brief = document.querySelector(`[id="${toggle.getAttribute('aria-controls')}"]`);

  expect(toggle).toHaveAttribute('aria-expanded', 'true');

  expect({ isClamped: brief?.classList.contains('lc_2'), text: brief?.textContent }).toStrictEqual({
    isClamped: false,
    text: 'Plan the vegetable beds for spring.\nPut the beans along the north fence, and keep the tomatoes out of the shade of the shed.',
  });
});

test('it cuts the brief of a task to 2 lines until it is opened', () => {
  const garden = buildMockListedTask({
    brief:
      'Plan the vegetable beds for spring.\nPut the beans along the north fence, and keep the tomatoes out of the shade of the shed.',
    name: 'Garden plan',
  });

  const rendered = render(<TaskSummary isLinked={false} task={garden} tasks={[garden]} />);
  const toggle = rendered.getByRole('button', { name: 'Show the whole prompt' });

  expect(document.querySelector(`[id="${toggle.getAttribute('aria-controls')}"]`)).toHaveClass(
    'lc_2',
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

test('it shows a waiting task as paused by nixie while the pause holds it', () => {
  const garden = buildMockListedTask({
    isPausedByNixie: true,
    name: 'Garden plan',
    state: 'waiting',
  });

  const rendered = render(<TaskSummary isLinked task={garden} tasks={[garden]} />);

  expect(rendered.getByText('Paused by nixie')).toBeVisible();
  expect(rendered.queryByText('Waiting')).toBeNull();
});

test('it shows a done task as done while the pause is on', () => {
  const garden = buildMockListedTask({ isPausedByNixie: true, name: 'Garden plan', state: 'done' });
  const rendered = render(<TaskSummary isLinked task={garden} tasks={[garden]} />);

  expect(rendered.getByText('Done')).toBeVisible();
  expect(rendered.queryByText('Paused by nixie')).toBeNull();
});

test('it labels a task by its listed state', () => {
  const garden = buildMockListedTask({
    listedState: 'asleep',
    name: 'Garden plan',
    state: 'waiting',
  });

  const rendered = render(<TaskSummary isLinked task={garden} tasks={[garden]} />);

  expect(rendered.getByText('Asleep')).toBeVisible();
});

test('it shows when a task run was scheduled and how late it fired', async () => {
  const garden = buildMockListedTask({
    fire: {
      firedAt: '2027-03-11T21:20:00.000Z',
      isCatchUp: true,
      scheduledFor: '2027-03-11T21:00:00.000Z',
    },
    name: 'Garden plan',
  });

  const rendered = render(<TaskSummary isLinked task={garden} tasks={[garden]} />);

  const scheduled = await rendered.findByText(/^Scheduled .*, fired 20 minutes late$/u);

  expect(scheduled).toBeVisible();
});

test('it shows the next run of an asleep task and the report of a finished one', async () => {
  const asleep = buildMockListedTask({
    listedState: 'asleep',
    nextRunAt: '2027-03-12T07:00:00.000Z',
    state: 'waiting',
  });

  const finished = buildMockListedTask({ listedState: 'finished', state: 'waiting' });

  const rendered = render(
    <>
      <TaskSummary isLinked task={asleep} tasks={[asleep]} />
      <TaskSummary isLinked task={finished} tasks={[finished]} />
    </>,
  );

  const nextRun = await rendered.findByText(/^Next run /u);

  expect(nextRun).toBeVisible();
  expect(rendered.getByText('Sent its report')).toBeVisible();
});
