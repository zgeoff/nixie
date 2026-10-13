import { expect, test } from 'bun:test';
import { resolveOwnerConfig } from './resolve-owner-config';

test("it reads the owner's name from the settings entry that the reference names", () => {
  expect(
    resolveOwnerConfig({ name: 'deployment:owner_name' }, { owner_name: 'Wren Halloway' }),
  ).toStrictEqual({ name: 'Wren Halloway' });
});

test('it keeps a plain name', () => {
  expect(resolveOwnerConfig({ name: 'Avery' }, { owner_name: 'Wren Halloway' })).toStrictEqual({
    name: 'Avery',
  });
});

test('it keeps no name when the configuration sets none', () => {
  expect(resolveOwnerConfig({ name: null }, { owner_name: 'Wren Halloway' })).toStrictEqual({
    name: null,
  });
});

test('it refuses a reference whose settings entry is missing', () => {
  expect(() =>
    resolveOwnerConfig({ name: 'deployment:owner_name' }, { other_name: 'Wren Halloway' }),
  ).toThrowWithMessage(
    Error,
    "the owner's name is deployment:owner_name, and the secrets file has no settings entry owner_name",
  );
});
