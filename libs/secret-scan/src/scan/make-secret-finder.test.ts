import { expect, test } from 'bun:test';
import { buildKey } from '../test-utils/build-key';
import { makeSecretFinder } from './make-secret-finder';

test('it reports the own-value rule for a URL that holds an own value as given', () => {
  const ownValue = buildKey('alphanumeric', 20, 9);
  const find = makeSecretFinder([ownValue]);

  expect(find(`https://host.test/items?ref=${ownValue}&page=2`)).toStrictEqual({
    rule: 'nixie-secret',
  });
});

test.each([
  ['upper-case', 'p%40ss%20w%2Frd%26%2B%3D'],
  ['lower-case', 'p%40ss%20w%2frd%26%2b%3d'],
])('it reports the own-value rule for a value encoded with %s hex', (_name, encoded) => {
  const find = makeSecretFinder(['p@ss w/rd&+=']);

  expect(find(`https://host.test/items?ref=${encoded}`)).toStrictEqual({ rule: 'nixie-secret' });
});

test('it reports the own-value rule for a value that holds a byte order mark', () => {
  const find = makeSecretFinder(['a\uFEFFb']);

  expect(find('https://host.test/?ref=a%EF%BB%BF%62')).toStrictEqual({ rule: 'nixie-secret' });
});

test('it reports the own-value rule for a URL that holds the value only once decoded', () => {
  const rest = buildKey('alphanumeric', 15, 9);
  const find = makeSecretFinder([`q${rest}`]);

  expect(find(`https://host.test/items?ref=%71${rest}`)).toStrictEqual({ rule: 'nixie-secret' });
});

test('it reports the own-value rule for a URL that holds an own value and a public key', () => {
  const ownValue = buildKey('alphanumeric', 20, 9);
  const find = makeSecretFinder([ownValue]);
  const publicKey = `ghp_${buildKey('alphanumeric', 36)}`;

  expect(find(`https://host.test/items?ref=${ownValue}&id=${publicKey}`)).toStrictEqual({
    rule: 'nixie-secret',
  });
});

test('it reports a public rule for a URL that holds no own value', () => {
  const find = makeSecretFinder([buildKey('alphanumeric', 20, 9)]);

  expect(find(`https://host.test/items?id=ghp_${buildKey('alphanumeric', 36)}`)).toStrictEqual({
    rule: 'github-pat',
  });
});

test('it behaves as the public scan when it holds no own value', () => {
  const find = makeSecretFinder([]);

  expect([
    find(`https://host.test/items?id=ghp_${buildKey('alphanumeric', 36)}`),
    find('https://host.test/items?page=2'),
  ]).toStrictEqual([{ rule: 'github-pat' }, null]);
});

test('it ignores an empty own value', () => {
  expect(makeSecretFinder([''])('https://host.test/items?page=2')).toBeNull();
});
