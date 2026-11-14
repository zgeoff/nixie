import { expect, test } from 'bun:test';
import { toContractKind } from './to-contract-kind';

test.each([
  ['owner', 'fact'],
  ['shared', 'fact'],
  ['self', 'self'],
] as const)('it gives the subject %s the kind %s', (subject, kind) => {
  expect(toContractKind(subject)).toBe(kind);
});
