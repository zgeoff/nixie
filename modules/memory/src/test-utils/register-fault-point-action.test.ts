import { expect, mock, onTestFinished, test } from 'bun:test';
import { waitAtFaultPoint } from '@heynixie/tasks';
import { registerFaultPointAction } from './register-fault-point-action';

test('it runs the action before the first arrival continues', async () => {
  const events: string[] = [];

  registerFaultPointAction('writer.batch.gated', async () => {
    await Promise.resolve();
    events.push('action');
  });

  await waitAtFaultPoint('writer.batch.gated', { kind: 'task', id: 'memory-writer' });
  events.push('continued');

  expect(events).toStrictEqual(['action', 'continued']);
});

test('it runs the action for the first arrival only', async () => {
  const action = mock(() => Promise.resolve());

  registerFaultPointAction('writer.batch.gated', action);

  await waitAtFaultPoint('writer.batch.gated', { kind: 'task', id: 'memory-writer' });
  await waitAtFaultPoint('writer.batch.gated', { kind: 'task', id: 'memory-writer' });

  expect(action).toHaveBeenCalledOnce();
});

test('it lets another fault point through without the action', async () => {
  const action = mock(() => Promise.resolve());

  registerFaultPointAction('writer.batch.gated', action);

  await waitAtFaultPoint('writer.batch.extracted', { kind: 'task', id: 'memory-writer' });

  expect(action).not.toHaveBeenCalled();
});

test('it removes the handler when the test finishes', () => {
  const action = mock(() => Promise.resolve());

  registerFaultPointAction('writer.batch.gated', action);
  onTestFinished(async () => {
    await waitAtFaultPoint('writer.batch.gated', { kind: 'task', id: 'memory-writer' });

    expect(action).not.toHaveBeenCalled();
  });
});
