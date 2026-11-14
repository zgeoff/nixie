import { expect, test } from 'bun:test';
import { buildMockListedTask } from '../test-utils/build-mock-listed-task';
import { collectOfferedControls } from './collect-offered-controls';

test('it offers a resume first to a waiting task that nixie pauses', () => {
  const task = buildMockListedTask({ isPausedByNixie: true, state: 'waiting' });

  expect(collectOfferedControls(task)).toStrictEqual(['resume', 'pause', 'stop', 'close']);
});

test('it offers one resume to a paused task that nixie pauses', () => {
  const task = buildMockListedTask({ isPausedByNixie: true, state: 'paused' });

  expect(collectOfferedControls(task)).toStrictEqual(['resume', 'stop', 'close']);
});

test('it offers no resume to a waiting task when nixie runs', () => {
  const task = buildMockListedTask({ isPausedByNixie: false, state: 'waiting' });

  expect(collectOfferedControls(task)).toStrictEqual(['pause', 'stop', 'close']);
});

test('it offers no resume to a done task that nixie pauses', () => {
  const task = buildMockListedTask({ isPausedByNixie: true, state: 'done' });

  expect(collectOfferedControls(task)).toStrictEqual(['close']);
});

test('it offers no resume that the runner of the task lacks', () => {
  const task = buildMockListedTask({
    controls: ['stop'],
    isPausedByNixie: true,
    state: 'waiting',
  });

  expect(collectOfferedControls(task)).toStrictEqual(['stop']);
});
