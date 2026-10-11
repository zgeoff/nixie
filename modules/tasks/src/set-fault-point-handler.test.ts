import { expect, onTestFinished, test } from 'bun:test';
import { setFaultPointHandler } from './set-fault-point-handler';

test('it refuses a handler outside a test build', () => {
  Object.assign(globalThis, { NIXIE_TEST_BUILD: false });
  onTestFinished(() => {
    Object.assign(globalThis, { NIXIE_TEST_BUILD: true });
  });

  expect(() => {
    setFaultPointHandler(async () => {});
  }).toThrowWithMessage(Error, 'fault points exist only in a test build');
});

test('it installs a handler in a test build', () => {
  onTestFinished(() => {
    setFaultPointHandler(null);
  });

  expect(() => {
    setFaultPointHandler(async () => {});
  }).not.toThrow();
});
