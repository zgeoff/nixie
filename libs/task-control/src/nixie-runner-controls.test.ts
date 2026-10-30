import { expect, test } from 'bun:test';
import { nixieRunnerControls } from './nixie-runner-controls';

test('it offers every control on the nixie runner', () => {
  expect(nixieRunnerControls).toStrictEqual([
    'pause',
    'resume',
    'stop',
    'restart',
    'close',
    'interrupt',
  ]);
});
