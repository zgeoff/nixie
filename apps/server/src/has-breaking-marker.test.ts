import { expect, test } from 'bun:test';
import { hasBreakingMarker } from './has-breaking-marker';

test.each([
  ['feat!: rename the server port', true],
  ['feat(geo-12)!: rename the server port', true],
  ['fix(config)!: refuse an empty data directory', true],
  ['feat(geo-12): rename the server port', false],
  ['feat: add a log level', false],
  ['feat(geo-12) !: rename the server port', false],
  ['feat(geo-12)!:rename the server port', false],
  ['revert the server port rename!', false],
])('it reads %p as marked breaking: %p', (header, expected) => {
  expect(hasBreakingMarker(header)).toBe(expected);
});
