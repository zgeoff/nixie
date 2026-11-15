import { expect, test } from 'bun:test';
import { readMockApprovalItems } from './read-mock-approval-items';
import { store } from './store';

test('it lists the open rows in the digest order', async () => {
  await store.tasks.create({ taskID: 'task-b', name: 'Boat repairs' });
  await store.tasks.create({ taskID: 'task-a', name: 'Allotment' });
  await store.approvalRows.create({ sentence: 'Deferred row.', state: 'deferred', sequence: 1 });

  await store.approvalRows.create({
    sentence: 'Memory row.',
    kind: 'memory_write',
    sequence: 2,
  });

  await store.approvalRows.create({ sentence: 'Boat row.', taskID: 'task-b', sequence: 3 });
  await store.approvalRows.create({ sentence: 'Allotment row.', taskID: 'task-a', sequence: 4 });

  await store.approvalRows.create({
    sentence: 'Always row.',
    riskClass: 'always_ask',
    sequence: 5,
  });

  await store.approvalRows.create({ sentence: 'Lifting row.', riskClass: 'lifting', sequence: 6 });

  expect(readMockApprovalItems().map((item) => [item.group, item.body.sentence])).toStrictEqual([
    ['always_ask', 'Lifting row.'],
    ['always_ask', 'Always row.'],
    ['routine', 'Allotment row.'],
    ['routine', 'Boat row.'],
    ['memory', 'Memory row.'],
    ['deferred', 'Deferred row.'],
  ]);
});

test('it leaves out closed rows, lapsed rows and rows whose body is gone', async () => {
  await store.approvalRows.create({ sentence: 'Open row.' });
  await store.approvalRows.create({ sentence: 'Approved row.', state: 'approved' });

  await store.approvalRows.create({
    sentence: 'Lapsed row.',
    lapsesAt: new Date(Date.now() - 1000),
  });

  await store.approvalRows.create({ sentence: 'Gone row.', isBodyGone: true });

  expect(readMockApprovalItems().map((item) => item.body.sentence)).toStrictEqual(['Open row.']);
});

test('it names the task of a row by its name', async () => {
  await store.tasks.create({ taskID: 'task-a', name: 'Allotment' });
  await store.approvalRows.create({ taskID: 'task-a' });

  expect(readMockApprovalItems().map((item) => item.task)).toStrictEqual([
    { id: 'task-a', name: 'Allotment' },
  ]);
});
