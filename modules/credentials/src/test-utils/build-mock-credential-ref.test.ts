import { expect, test } from 'bun:test';
import { buildMockCredentialRef } from './build-mock-credential-ref';

test('it builds a reference to a model credential of the file backend', () => {
  expect(buildMockCredentialRef('opus')).toStrictEqual({
    backend: 'file',
    group: 'model_credentials',
    name: 'opus',
  });
});
