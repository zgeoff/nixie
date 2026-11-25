import { expect, test } from 'bun:test';
import { packageInputSchema, parsePackageSpec } from './package-spec';

test.each([
  ['chart.js@4.4.6', { name: 'chart.js', version: '4.4.6' }],
  ['@scope/pkg@1.0.0-rc.1', { name: '@scope/pkg', version: '1.0.0-rc.1' }],
  ['pkg@1.0.0-0.3.7+build.5', { name: 'pkg', version: '1.0.0-0.3.7+build.5' }],
  ['pkg@0.0.0-a-b.1x', { name: 'pkg', version: '0.0.0-a-b.1x' }],
])('it splits %s into its name and its version', (spec, expected) => {
  expect(parsePackageSpec(spec)).toStrictEqual(expected);
});

test.each(['chart.js', 'chart.js@4', 'chart.js@~4.4.0', '../x@1.0.0'])(
  'it returns null for %s',
  (spec) => {
    expect(parsePackageSpec(spec)).toBeNull();
  },
);

test.each([
  '01.2.3',
  '1.02.3',
  '1.2.03',
  '1.2.3-a..b',
  '1.2.3-01',
  '1.2.3-',
  '1.2.3+',
  '1.2.3+a..b',
  '1.2',
  '~1.2.3',
  'latest',
])('it refuses the version %s, in a spec and in a package input', (version) => {
  expect([
    parsePackageSpec(`chart.js@${version}`),
    packageInputSchema.safeParse({ name: 'chart.js', version }).success,
  ]).toStrictEqual([null, false]);
});

test('it accepts an exact version in a package input', () => {
  expect(packageInputSchema.parse({ name: 'chart.js', version: '4.4.6' })).toStrictEqual({
    name: 'chart.js',
    version: '4.4.6',
  });
});
