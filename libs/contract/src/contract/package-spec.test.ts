import { expect, test } from 'bun:test';
import { parsePackageSpec } from './package-spec';

test.each([
  ['chart.js@4.4.6', { name: 'chart.js', version: '4.4.6' }],
  ['@scope/pkg@1.0.0-rc.1', { name: '@scope/pkg', version: '1.0.0-rc.1' }],
])('it splits %s into its name and its version', (spec, expected) => {
  expect(parsePackageSpec(spec)).toStrictEqual(expected);
});

test.each(['chart.js', 'chart.js@4', 'chart.js@~4.4.0', '../x@1.0.0'])(
  'it returns null for %s',
  (spec) => {
    expect(parsePackageSpec(spec)).toBeNull();
  },
);
