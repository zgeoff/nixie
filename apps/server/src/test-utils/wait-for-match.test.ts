import { expect, test } from 'bun:test';
import { waitForMatch } from './wait-for-match';

test('it returns the first matching record once a later read holds one', async () => {
  const reads = [
    [],
    [{ sequence: 1, kind: 'task.created', thread: 'task-1', stepKey: null, payload: {} }],
    [
      { sequence: 1, kind: 'task.created', thread: 'task-1', stepKey: null, payload: {} },
      { sequence: 2, kind: 'step.committed', thread: 'task-1', stepKey: 'task-1:1', payload: {} },
      { sequence: 3, kind: 'step.committed', thread: 'task-1', stepKey: 'task-1:2', payload: {} },
    ],
  ];

  const record = await waitForMatch(
    () => Promise.resolve(reads.shift() ?? []),
    (candidate) => candidate.kind === 'step.committed',
    1000,
  );

  expect(record).toStrictEqual({
    sequence: 2,
    kind: 'step.committed',
    thread: 'task-1',
    stepKey: 'task-1:1',
    payload: {},
  });
});

test('it throws once the timeout passes with no matching record', () => {
  expect(
    waitForMatch(
      () =>
        Promise.resolve([
          { sequence: 1, kind: 'task.created', thread: 'task-1', stepKey: null, payload: {} },
        ]),
      (candidate) => candidate.kind === 'step.committed',
      20,
    ),
  ).rejects.toThrowWithMessage(Error, 'condition not met within 20 ms');
});

test('it rejects with the error of a read that fails', () => {
  expect(
    waitForMatch(
      () => Promise.reject(new Error('the log is gone')),
      () => true,
      1000,
    ),
  ).rejects.toThrowWithMessage(Error, 'the log is gone');
});
