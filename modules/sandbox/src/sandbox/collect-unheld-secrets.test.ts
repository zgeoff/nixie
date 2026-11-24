import { expect, test } from 'bun:test';
import { collectUnheldSecrets } from './collect-unheld-secrets';

test('it returns the names nixie added that no live sandbox holds', () => {
  expect(
    collectUnheldSecrets({ added: ['a', 'b', 'c'], live: ['b'], hostHeld: [], pending: [] }),
  ).toStrictEqual(['a', 'c']);
});

test('it never returns a name that a host-held profile gives', () => {
  expect(
    collectUnheldSecrets({ added: ['a', 'b'], live: [], hostHeld: ['a'], pending: [] }),
  ).toStrictEqual(['b']);
});

test('it never returns a name that a grant in flight holds', () => {
  expect(
    collectUnheldSecrets({ added: ['a', 'b'], live: [], hostHeld: [], pending: ['b'] }),
  ).toStrictEqual(['a']);
});

test('it never returns a name nixie never added', () => {
  expect(collectUnheldSecrets({ added: ['a'], live: [], hostHeld: [], pending: [] })).not.toContain(
    'operator-secret',
  );
});

test('it returns a name once however often the records name it', () => {
  expect(
    collectUnheldSecrets({ added: ['a', 'a'], live: [], hostHeld: [], pending: [] }),
  ).toStrictEqual(['a']);
});
