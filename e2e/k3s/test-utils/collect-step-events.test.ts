import { expect, test } from 'bun:test';
import { collectStepEvents } from './collect-step-events';

test('it reads through the end of the next step and notes each lag', async () => {
  const stream = [
    { record: { kind: 'tool_called', recordedAt: new Date(1000) } },
    { record: { kind: 'task.step_committed', recordedAt: new Date(1500) } },
    { record: { kind: 'owner_message', recordedAt: new Date(1800) } },
  ].values();

  const received = await collectStepEvents(
    { next: () => Promise.resolve(stream.next()) },
    () => 2000,
  );

  expect(received).toStrictEqual([
    { kind: 'tool_called', lagMs: 1000 },
    { kind: 'task.step_committed', lagMs: 500 },
  ]);
});

test('it ends with what arrived when the stream ends before the step does', async () => {
  const stream = [{ record: { kind: 'tool_called', recordedAt: new Date(1000) } }].values();

  const received = await collectStepEvents(
    { next: () => Promise.resolve(stream.next()) },
    () => 1200,
  );

  expect(received).toStrictEqual([{ kind: 'tool_called', lagMs: 200 }]);
});
