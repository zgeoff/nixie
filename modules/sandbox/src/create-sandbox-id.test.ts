import { expect, test } from 'bun:test';
import { createSandboxID } from './create-sandbox-id';

test('it names a sandbox nixie- and 24 lowercase hex digits, within the 31 characters of an imp name', () => {
  expect(createSandboxID()).toMatch(/^nixie-[\da-f]{24}$/u);
});

test('it gives each sandbox a new name', () => {
  expect(createSandboxID()).not.toBe(createSandboxID());
});
