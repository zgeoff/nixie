import { expect, mock, onTestFinished, test } from 'bun:test';
import { waitAtFaultPoint } from '@heynixie/tasks';
import { registerFaultPointAction } from './register-fault-point-action';

test('it runs the action before the first arrival continues', async () => {
  const events: string[] = [];

  registerFaultPointAction('memory.lapse.read', async () => {
    await Promise.resolve();

    events.push('action');
  });

  await waitAtFaultPoint('memory.lapse.read', { kind: 'memory', id: null });

  events.push('continued');

  expect(events).toStrictEqual(['action', 'continued']);
});

test('it runs the action for the first arrival only', async () => {
  const action = mock(() => Promise.resolve());

  registerFaultPointAction('memory.lapse.read', action);

  await waitAtFaultPoint('memory.lapse.read', { kind: 'memory', id: null });
  await waitAtFaultPoint('memory.lapse.read', { kind: 'memory', id: null });

  expect(action).toHaveBeenCalledOnce();
});

test('it lets another fault point through without the action', async () => {
  const action = mock(() => Promise.resolve());

  registerFaultPointAction('memory.lapse.read', action);

  await waitAtFaultPoint('memory.recall.checked', { kind: 'memory', id: null });

  expect(action).not.toHaveBeenCalled();
});

test('it removes the handler when the test finishes', () => {
  const action = mock(() => Promise.resolve());

  registerFaultPointAction('memory.lapse.read', action);

  onTestFinished(async () => {
    await waitAtFaultPoint('memory.lapse.read', { kind: 'memory', id: null });

    expect(action).not.toHaveBeenCalled();
  });
});
