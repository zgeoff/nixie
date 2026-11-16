import { expect, test } from 'bun:test';
import { taskControls } from './task-controls';

test('it lists every control', () => {
  expect(taskControls).toStrictEqual(['pause', 'resume', 'stop', 'restart', 'close', 'interrupt']);
});
