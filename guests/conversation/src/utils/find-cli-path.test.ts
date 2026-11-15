import { expect, onTestFinished, test } from 'bun:test';
import { findCLIPath } from './find-cli-path';

test('it returns undefined when the guest runs from source', () => {
  expect(findCLIPath()).toBeUndefined();
});

test('it returns the path that the build defined', () => {
  Reflect.set(globalThis, 'NIXIE_CLI_PATH', '/app/claude');

  onTestFinished(() => Reflect.deleteProperty(globalThis, 'NIXIE_CLI_PATH'));

  expect(findCLIPath()).toBe('/app/claude');
});
