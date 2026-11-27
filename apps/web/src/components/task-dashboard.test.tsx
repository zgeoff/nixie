import { expect, mock, test } from 'bun:test';
import { waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { formatSessionEventTime } from '../coding/format-session-event-time';
import { LiveConnection } from '../live/live-connection';
import { featureStore } from '../mocks/feature-store';
import { pauseStore } from '../mocks/pause-store';
import { store } from '../mocks/store';
import { buildStubTimer } from '../test-utils/build-stub-timer';
import { createDeviceSession } from '../test-utils/create-device-session';
import { render } from '../test-utils/render';
import { TaskDashboard } from './task-dashboard';

function setupTest() {
  return { user: userEvent.setup(), timer: buildStubTimer() };
}

test('it lists the conversation, then the working and the held tasks, with who waits on whom', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  await store.tasks.create({ name: 'Conversation', state: 'waiting', taskID: 'conversation' });

  await store.tasks.create({
    brief: 'Plans the vegetable beds.',
    name: 'Garden plan',
    state: 'running',
    taskID: 'k3vq8m2xpa',
    waitingOn: 'p7hd2wq9zn',
  });

  await store.tasks.create({ name: 'Seed order', state: 'paused', taskID: 'p7hd2wq9zn' });
  await store.tasks.create({ name: 'Tiler booking', state: 'done', taskID: 'r5bn1cy6tf' });

  const rendered = render(
    <TaskDashboard filters={{}} onFiltersChange={() => {}} startTimer={ctx.timer.startTimer} />,
  );

  const working = await rendered.findByRole('region', { name: 'Working' });

  const held = rendered.getByRole('region', { name: 'Held' });

  expect(rendered.getByRole('region', { name: 'Conversation' })).toHaveTextContent('Conversation');

  expect(within(working).getByRole('listitem', { name: 'Garden plan' })).toHaveTextContent(
    'Plans the vegetable beds.Waiting on Seed order',
  );

  expect(within(held).getByRole('listitem', { name: 'Seed order' })).toHaveTextContent(
    'Garden plan is waiting on this task',
  );

  expect(rendered.queryByText('Tiler booking')).toBeNull();
});

test('it lists a task that supervises a session in its own group, with the session state and the time of its last event', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  await store.tasks.create({
    name: 'Fix the flaky login test',
    runner: 'atc',
    session: {
      isReleased: false,
      lastEventAt: new Date('2027-03-09T10:00:00.000Z'),
      origin: 'started',
      state: 'waiting',
    },
    state: 'waiting',
    taskID: 'k3vq8m2xpa',
  });

  await store.tasks.create({ name: 'Garden plan', state: 'running', taskID: 'p7hd2wq9zn' });

  const rendered = render(
    <TaskDashboard filters={{}} onFiltersChange={() => {}} startTimer={ctx.timer.startTimer} />,
  );

  const coding = await rendered.findByRole('region', { name: 'Coding sessions' });

  const row = within(coding).getByRole('listitem', { name: 'Fix the flaky login test' });

  expect(coding).toHaveTextContent('These sessions run in another program, outside nixie.');
  expect(row).toHaveTextContent('Coding session, outside nixie: started by nixie');
  expect(within(row).getByLabelText('Session state')).toHaveTextContent('Waiting for you');

  await waitFor(() => {
    expect(row).toHaveTextContent(formatSessionEventTime(new Date('2027-03-09T10:00:00.000Z')));
  });

  expect(
    within(rendered.getByRole('region', { name: 'Working' })).queryByText(
      'Fix the flaky login test',
    ),
  ).toBeNull();
});

test('it moves the shown session state when the session changes, with no reload', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  const task = await store.tasks.create({
    name: 'Fix the flaky login test',
    runner: 'atc',
    session: { isReleased: false, lastEventAt: null, origin: 'started', state: 'running' },
    state: 'waiting',
    taskID: 'k3vq8m2xpa',
  });

  const rendered = render(
    <>
      <LiveConnection />
      <TaskDashboard filters={{}} onFiltersChange={() => {}} startTimer={ctx.timer.startTimer} />
    </>,
  );

  const row = await rendered.findByRole('listitem', { name: 'Fix the flaky login test' });

  expect(within(row).getByLabelText('Session state')).toHaveTextContent('Running');
  expect(row).toHaveTextContent('No event yet');

  await store.tasks.update(task, {
    data(draft) {
      draft.session = {
        isReleased: false,
        lastEventAt: new Date('2027-03-09T10:05:00.000Z'),
        origin: 'started',
        state: 'idle',
      };
    },
  });

  await waitFor(() => {
    expect(
      within(rendered.getByRole('listitem', { name: 'Fix the flaky login test' })).getByLabelText(
        'Session state',
      ),
    ).toHaveTextContent('Idle');
  });

  expect(rendered.getByRole('listitem', { name: 'Fix the flaky login test' })).toHaveTextContent(
    formatSessionEventTime(new Date('2027-03-09T10:05:00.000Z')),
  );
});

test('it keeps a task that supervises a session in the working group while coding is off', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  await featureStore.featuresOff.create({ feature: 'coding' });

  await store.tasks.create({
    name: 'Fix the flaky login test',
    runner: 'atc',
    session: { isReleased: false, lastEventAt: null, origin: 'started', state: 'running' },
    state: 'waiting',
    taskID: 'k3vq8m2xpa',
  });

  const rendered = render(
    <TaskDashboard filters={{}} onFiltersChange={() => {}} startTimer={ctx.timer.startTimer} />,
  );

  const working = await rendered.findByRole('region', { name: 'Working' });
  const row = await within(working).findByRole('listitem', { name: 'Fix the flaky login test' });

  expect(rendered.queryByRole('region', { name: 'Coding sessions' })).toBeNull();
  expect(row).not.toHaveTextContent('Coding session');
});

test('it stops the session that nixie started, and a close afterwards says nothing more of it', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  await store.tasks.create({
    name: 'Started fix',
    runner: 'atc',
    session: { isReleased: false, lastEventAt: null, origin: 'started', state: 'running' },
    taskID: 'k3vq8m2xpa',
  });

  const rendered = render(
    <TaskDashboard filters={{}} onFiltersChange={() => {}} startTimer={ctx.timer.startTimer} />,
  );

  const row = await rendered.findByRole('group', { name: 'Controls for Started fix' });

  await ctx.user.click(within(row).getByRole('button', { name: 'Stop' }));

  const stopping = within(row).getByRole('group', { name: 'Stop the task' });

  const stopLine = await within(stopping).findByText('This also stops its coding session.');

  expect(stopLine).toBeVisible();

  await waitFor(() => {
    expect(within(stopping).getByRole('button', { name: 'Stop the task' })).toBeEnabled();
  });

  await ctx.user.click(within(stopping).getByRole('button', { name: 'Stop the task' }));

  await waitFor(() => {
    expect(
      store.tasks.findFirst((query) => query.where({ taskID: 'k3vq8m2xpa' }))?.session?.isReleased,
    ).toBeTrue();
  });

  const close = await within(row).findByRole('button', { name: 'Close' });

  await ctx.user.click(close);

  const closing = within(row).getByRole('group', { name: 'Close the task' });

  expect(within(closing).queryByText(/coding session/u)).toBeNull();

  await ctx.user.click(within(closing).getByRole('button', { name: 'Close the task' }));

  await waitFor(() => {
    expect(store.tasks.findFirst((query) => query.where({ taskID: 'k3vq8m2xpa' }))?.state).toBe(
      'closed',
    );
  });
});

test('it says that a close stops the session that nixie started, when no stop came first', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  await store.tasks.create({
    name: 'Started fix',
    runner: 'atc',
    session: { isReleased: false, lastEventAt: null, origin: 'started', state: 'running' },
    taskID: 'k3vq8m2xpa',
  });

  const rendered = render(
    <TaskDashboard filters={{}} onFiltersChange={() => {}} startTimer={ctx.timer.startTimer} />,
  );

  const row = await rendered.findByRole('group', { name: 'Controls for Started fix' });

  await ctx.user.click(within(row).getByRole('button', { name: 'Close' }));

  const closing = within(row).getByRole('group', { name: 'Close the task' });

  expect(within(closing).getByText('This also stops its coding session.')).toBeVisible();
});

test('it says nothing of a joined session when you stop the task', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  await store.tasks.create({
    name: 'Joined refactor',
    runner: 'atc',
    session: { isReleased: false, lastEventAt: null, origin: 'joined', state: 'running' },
    taskID: 'p7hd2wq9zn',
  });

  const rendered = render(
    <TaskDashboard filters={{}} onFiltersChange={() => {}} startTimer={ctx.timer.startTimer} />,
  );

  const row = await rendered.findByRole('group', { name: 'Controls for Joined refactor' });

  await ctx.user.click(within(row).getByRole('button', { name: 'Stop' }));

  const stopping = within(row).getByRole('group', { name: 'Stop the task' });

  await waitFor(() => {
    expect(within(stopping).getByRole('button', { name: 'Stop the task' })).toBeEnabled();
  });

  expect(within(stopping).queryByText(/coding session/u)).toBeNull();

  await ctx.user.click(within(stopping).getByRole('button', { name: 'Stop the task' }));

  await waitFor(() => {
    expect(store.tasks.findFirst((query) => query.where({ taskID: 'p7hd2wq9zn' }))?.state).toBe(
      'stopped',
    );
  });
});

test('it pauses and resumes a coding task, while its session keeps running', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  await store.tasks.create({
    name: 'Fix the flaky login test',
    runner: 'atc',
    session: { isReleased: false, lastEventAt: null, origin: 'started', state: 'running' },
    state: 'waiting',
    taskID: 'k3vq8m2xpa',
  });

  const rendered = render(
    <TaskDashboard filters={{}} onFiltersChange={() => {}} startTimer={ctx.timer.startTimer} />,
  );

  const coding = await rendered.findByRole('region', { name: 'Coding sessions' });
  const pause = await within(coding).findByRole('button', { name: 'Pause' });

  await ctx.user.click(pause);

  const keepsRunning = await within(coding).findByText(
    'The session keeps running while the task is paused.',
  );

  expect(keepsRunning).toBeVisible();

  const resume = await within(coding).findByRole('button', { name: 'Resume' });

  await ctx.user.click(resume);

  await waitFor(() => {
    expect(store.tasks.findFirst((query) => query.where({ taskID: 'k3vq8m2xpa' }))?.state).toBe(
      'waiting',
    );
  });

  expect(
    within(coding).queryByText('The session keeps running while the task is paused.'),
  ).toBeNull();
});

test('it keeps a task whose session ended in the coding group, until you close it', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  await store.tasks.create({
    listedState: 'done',
    name: 'Fix the flaky login test',
    runner: 'atc',
    session: { isReleased: false, lastEventAt: null, origin: 'started', state: 'ended' },
    state: 'done',
    taskID: 'k3vq8m2xpa',
  });

  const rendered = render(
    <TaskDashboard filters={{}} onFiltersChange={() => {}} startTimer={ctx.timer.startTimer} />,
  );

  const coding = await rendered.findByRole('region', { name: 'Coding sessions' });
  const row = await within(coding).findByRole('listitem', { name: 'Fix the flaky login test' });

  expect(within(row).getByLabelText('Session state')).toHaveTextContent('Ended');
});

test('it pauses a task from the dashboard', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  await store.tasks.create({ name: 'Garden plan', state: 'waiting', taskID: 'k3vq8m2xpa' });

  const rendered = render(
    <TaskDashboard filters={{}} onFiltersChange={() => {}} startTimer={ctx.timer.startTimer} />,
  );

  const row = await rendered.findByRole('group', { name: 'Controls for Garden plan' });

  await ctx.user.click(within(row).getByRole('button', { name: 'Pause' }));

  await waitFor(() => {
    expect(store.tasks.findFirst((query) => query.where({ taskID: 'k3vq8m2xpa' }))?.state).toBe(
      'paused',
    );
  });

  const held = rendered.getByRole('region', { name: 'Held' });

  const resume = await within(held).findByRole('button', { name: 'Resume' });

  expect(resume).toBeEnabled();
});

test('it shows a pause of a running task as requested until the step ends', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  await store.tasks.create({ name: 'Garden plan', state: 'running', taskID: 'k3vq8m2xpa' });

  const rendered = render(
    <TaskDashboard filters={{}} onFiltersChange={() => {}} startTimer={ctx.timer.startTimer} />,
  );

  const row = await rendered.findByRole('group', { name: 'Controls for Garden plan' });

  await ctx.user.click(within(row).getByRole('button', { name: 'Pause' }));

  const requested = await within(row).findByRole('status');

  expect(requested).toHaveTextContent('Pause requested');
});

test('it lists what a stop cancels, and stops the task once you confirm', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  await store.tasks.create({ name: 'Garden plan', state: 'running', taskID: 'k3vq8m2xpa' });
  await store.taskActions.create({ taskID: 'k3vq8m2xpa', tool: 'mail.send' });
  await store.taskActions.create({ attempts: 1, taskID: 'k3vq8m2xpa', tool: 'web.fetch' });

  const rendered = render(
    <TaskDashboard filters={{}} onFiltersChange={() => {}} startTimer={ctx.timer.startTimer} />,
  );

  const row = await rendered.findByRole('group', { name: 'Controls for Garden plan' });

  await ctx.user.click(within(row).getByRole('button', { name: 'Stop' }));

  const confirmation = within(row).getByRole('group', { name: 'Stop the task' });

  const cancels = await within(confirmation).findByText(
    'The stop cancels 1 action not yet started: mail.send.',
  );

  expect(cancels).toBeVisible();

  expect(
    within(confirmation).getByText('Already started, so it runs to its outcome: web.fetch.'),
  ).toBeVisible();

  await ctx.user.click(within(confirmation).getByRole('button', { name: 'Stop the task' }));

  await waitFor(() => {
    expect(store.tasks.findFirst((query) => query.where({ taskID: 'k3vq8m2xpa' }))?.state).toBe(
      'stopped',
    );
  });

  expect(
    store.taskActions
      .all()
      .map((action) => ({ isCancelled: action.isCancelled, tool: action.tool })),
  ).toIncludeSameMembers([
    { isCancelled: true, tool: 'mail.send' },
    { isCancelled: false, tool: 'web.fetch' },
  ]);
});

test('it closes a task only once you confirm', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  await store.tasks.create({ name: 'Garden plan', state: 'waiting', taskID: 'k3vq8m2xpa' });

  const rendered = render(
    <TaskDashboard filters={{}} onFiltersChange={() => {}} startTimer={ctx.timer.startTimer} />,
  );

  const row = await rendered.findByRole('group', { name: 'Controls for Garden plan' });

  await ctx.user.click(within(row).getByRole('button', { name: 'Close' }));

  const asked = store.tasks.findFirst((query) => query.where({ taskID: 'k3vq8m2xpa' }))?.state;

  await ctx.user.click(within(row).getByRole('button', { name: 'Close the task' }));

  await waitFor(() => {
    expect(store.tasks.findFirst((query) => query.where({ taskID: 'k3vq8m2xpa' }))?.state).toBe(
      'closed',
    );
  });

  expect(asked).toBe('waiting');
});

test('it interrupts the turn of a running task', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  await store.tasks.create({ name: 'Garden plan', state: 'running', taskID: 'k3vq8m2xpa' });

  const rendered = render(
    <TaskDashboard filters={{}} onFiltersChange={() => {}} startTimer={ctx.timer.startTimer} />,
  );

  const row = await rendered.findByRole('group', { name: 'Controls for Garden plan' });

  await ctx.user.click(within(row).getByRole('button', { name: 'Interrupt' }));

  await waitFor(() => {
    expect(store.taskControlActions.all().map((action) => action.control)).toStrictEqual([
      'interrupt',
    ]);
  });
});

test('it offers only the controls the runner of a task offers', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  await store.tasks.create({
    controls: ['stop'],
    name: 'Garden plan',
    state: 'running',
    taskID: 'k3vq8m2xpa',
  });

  const rendered = render(
    <TaskDashboard filters={{}} onFiltersChange={() => {}} startTimer={ctx.timer.startTimer} />,
  );

  const row = await rendered.findByRole('group', { name: 'Controls for Garden plan' });

  expect(
    within(row)
      .getAllByRole('button')
      .map((button) => button.textContent),
  ).toStrictEqual(['Stop']);
});

test('it reads the list again when a task record arrives on the live stream', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  const garden = await store.tasks.create({
    name: 'Garden plan',
    state: 'running',
    taskID: 'k3vq8m2xpa',
  });

  const rendered = render(
    <>
      <LiveConnection />
      <TaskDashboard filters={{}} onFiltersChange={() => {}} startTimer={ctx.timer.startTimer} />
    </>,
  );

  await rendered.findByRole('listitem', { name: 'Garden plan' });

  await store.tasks.update(garden, {
    data(draft) {
      draft.state = 'paused';
    },
  });

  await store.records.create({ kind: 'task.paused', thread: 'k3vq8m2xpa' });

  const held = rendered.getByRole('region', { name: 'Held' });

  const paused = await within(held).findByRole('listitem', { name: 'Garden plan' });

  expect(paused).toHaveTextContent('Paused');
});

test('it reads the list again when a message of yours arrives on the live stream', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  const garden = await store.tasks.create({
    name: 'Garden plan',
    state: 'waiting',
    taskID: 'k3vq8m2xpa',
  });

  const rendered = render(
    <>
      <LiveConnection />
      <TaskDashboard filters={{}} onFiltersChange={() => {}} startTimer={ctx.timer.startTimer} />
    </>,
  );

  const row = await rendered.findByRole('listitem', { name: 'Garden plan' });

  await store.tasks.update(garden, {
    data(draft) {
      draft.state = 'ready';
    },
  });

  await store.records.create({ kind: 'owner_message', thread: 'k3vq8m2xpa' });

  await waitFor(() => {
    expect(row).toHaveTextContent('Ready');
  });
});

test('it offers Pause nixie on the dashboard, and shows each task paused once nixie pauses', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  await store.tasks.create({ name: 'Garden plan', state: 'waiting', taskID: 'k3vq8m2xpa' });

  const rendered = render(
    <TaskDashboard filters={{}} onFiltersChange={() => {}} startTimer={ctx.timer.startTimer} />,
  );

  const pauseButton = await rendered.findByRole('button', { name: 'Pause nixie' });

  await ctx.user.click(pauseButton);

  const row = await rendered.findByRole('listitem', { name: 'Garden plan' });

  await waitFor(() => {
    expect(row).toHaveTextContent('Paused by nixie');
  });

  expect(pauseStore.pauses.all()).toHaveLength(1);
  expect(rendered.queryByRole('button', { name: 'Pause nixie' })).toBeNull();
});

test('it lists a task by its listed state, and offers a definition and a state filter', async () => {
  const ctx = setupTest();
  const picked = mock<(filters: unknown) => void>();

  await createDeviceSession();

  await store.tasks.create({
    definitionID: 'water-the-tomatoes',
    listedState: 'asleep',
    name: 'Water the tomatoes',
    state: 'waiting',
    taskID: 'k3vq8m2xpa',
  });

  const rendered = render(
    <TaskDashboard filters={{}} onFiltersChange={picked} startTimer={ctx.timer.startTimer} />,
  );

  const working = await rendered.findByRole('region', { name: 'Working' });

  expect(within(working).getByRole('listitem', { name: 'Water the tomatoes' })).toHaveTextContent(
    'Asleep',
  );

  const stateFilter = await rendered.findByLabelText('State');

  await ctx.user.selectOptions(stateFilter, 'Asleep');

  expect(picked).toHaveBeenLastCalledWith({ state: 'asleep' });

  await ctx.user.selectOptions(rendered.getByLabelText('Definition'), 'Water the tomatoes');

  expect(picked).toHaveBeenLastCalledWith({ definition: 'water-the-tomatoes' });
});

test('it shows only the groups that hold a match under a filter, and clears the filters', async () => {
  const ctx = setupTest();
  const changed = mock<(filters: unknown) => void>();

  await createDeviceSession();

  await store.tasks.create({ listedState: 'failed', name: 'Seed order', state: 'failed' });
  await store.tasks.create({ listedState: 'idle', name: 'Tiler booking', state: 'waiting' });

  const rendered = render(
    <TaskDashboard
      filters={{ state: 'failed' }}
      onFiltersChange={changed}
      startTimer={ctx.timer.startTimer}
    />,
  );

  await rendered.findByRole('region', { name: 'Held' });

  expect(rendered.queryByRole('region', { name: 'Working' })).toBeNull();
  expect(rendered.queryByText('Tiler booking')).toBeNull();

  await ctx.user.click(rendered.getByRole('button', { name: 'Clear filters' }));

  expect(changed).toHaveBeenCalledWith({});
});

test('it hides the definition filter while no task has a definition', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  await store.tasks.create({ name: 'Seed order', state: 'waiting' });

  const rendered = render(
    <TaskDashboard filters={{}} onFiltersChange={() => {}} startTimer={ctx.timer.startTimer} />,
  );

  await rendered.findByText('Seed order');

  expect(rendered.queryByLabelText('Definition')).toBeNull();
});
