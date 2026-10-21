import { expect, onTestFinished, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { startTestNixie } from './start-test-nixie';

test('it starts nixie on the crash harness clock at 1,000,000 ms', async () => {
  const nixie = await startTestNixie();

  const first = nixie.harness.start();

  await first.ready;

  expect(nixie.harness.now()).toBe(1_000_000);
}, 60_000);

test('it reads back the records that nixie writes', async () => {
  const nixie = await startTestNixie();

  const first = nixie.harness.start();

  await first.ready;

  const created = await first.request('createTask', { brief: 'Wait an hour.' });

  const taskID = String(created);

  const record = await nixie.waitForRecord((candidate) => candidate.stepKey === `${taskID}:1`);

  expect(record).toMatchObject({ thread: taskID, stepKey: `${taskID}:1` });
}, 60_000);

test('it keeps the leases and the tasks that each start recovered', async () => {
  const nixie = await startTestNixie();

  const first = nixie.harness.start([{ point: 'claim.after', kind: 'task' }]);

  await first.ready;

  const created = await first.request('createTask', { brief: 'Wait an hour.' });

  const taskID = String(created);

  await first.waitForArrival('claim.after');
  await first.kill();

  const second = nixie.harness.start();

  await second.ready;

  expect(nixie.readRecoveredStates()).toMatchObject([
    { leases: [], tasks: [{ task_id: 'conversation' }] },
    {
      leases: [{ kind: 'task', work_id: taskID, holder: null, generation: 1 }],
      tasks: [{ task_id: 'conversation' }, { task_id: taskID, state: 'ready' }],
    },
  ]);
}, 60_000);

test('it removes its data directory once the test finishes', async () => {
  const nixie = await startTestNixie();

  const first = nixie.harness.start();

  await first.ready;

  onTestFinished(() => {
    expect(existsSync(nixie.dataDir)).toBeFalse();
  });
}, 60_000);
