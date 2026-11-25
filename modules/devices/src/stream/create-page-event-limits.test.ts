import { expect, test } from 'bun:test';
import { createPageEventLimits } from './create-page-event-limits';

test('#createPageEventLimits admits the first event of a region', () => {
  expect(createPageEventLimits().admit('dk4m7q2w9x', 'pond', 1_000_000)).toBeTrue();
});

test('#createPageEventLimits drops a second event inside the same second', () => {
  const limits = createPageEventLimits();

  limits.admit('dk4m7q2w9x', 'pond', 1_000_000);

  expect(limits.admit('dk4m7q2w9x', 'pond', 1_000_999)).toBeFalse();
});

test('#createPageEventLimits admits the next event a second later', () => {
  const limits = createPageEventLimits();

  limits.admit('dk4m7q2w9x', 'pond', 1_000_000);

  expect(limits.admit('dk4m7q2w9x', 'pond', 1_001_000)).toBeTrue();
});

test('#createPageEventLimits drops the 31st event of a minute', () => {
  const limits = createPageEventLimits();

  const admitted = Array.from({ length: 31 }, (_, index) =>
    limits.admit('dk4m7q2w9x', 'pond', 1_000_000 + index * 1500),
  );

  expect(admitted.filter(Boolean)).toHaveLength(30);
});

test('#createPageEventLimits admits again once the minute has passed', () => {
  const limits = createPageEventLimits();

  for (let index = 0; index < 30; index += 1) {
    limits.admit('dk4m7q2w9x', 'pond', 1_000_000 + index * 1500);
  }

  expect(limits.admit('dk4m7q2w9x', 'pond', 1_000_000 + 60_000 + 1)).toBeTrue();
});

test('#createPageEventLimits counts each region apart', () => {
  const limits = createPageEventLimits();

  limits.admit('dk4m7q2w9x', 'pond', 1_000_000);

  expect(limits.admit('dk4m7q2w9x', 'note', 1_000_100)).toBeTrue();
});
