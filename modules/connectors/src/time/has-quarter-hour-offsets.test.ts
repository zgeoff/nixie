import { expect, test } from 'bun:test';
import { hasQuarterHourOffsets } from './has-quarter-hour-offsets';

test.each([
  ['Asia/Kathmandu', '2026-01-01T00:00:00Z'],
  ['Australia/Adelaide', '2026-07-01T00:00:00Z'],
  ['Europe/London', '2026-01-01T00:00:00Z'],
])('#hasQuarterHourOffsets accepts %s at %s', (zone, instant) => {
  expect(hasQuarterHourOffsets(zone, [Date.parse(instant)])).toBeTrue();
});

test('#hasQuarterHourOffsets refuses a zone whose offset was 44 minutes 30 seconds', () => {
  expect(
    hasQuarterHourOffsets('Africa/Monrovia', [Date.parse('1960-01-01T00:00:00Z')]),
  ).toBeFalse();
});
