import { expect, test } from 'bun:test';
import { canSendEvent } from './can-send-event';

test('#canSendEvent admits the first event of a region', () => {
  expect(canSendEvent([], 1_000_000)).toBeTrue();
});

test('#canSendEvent refuses a second event inside a second', () => {
  expect(canSendEvent([1_000_000], 1_000_999)).toBeFalse();
});

test('#canSendEvent admits an event a second after the last', () => {
  expect(canSendEvent([1_000_000], 1_001_000)).toBeTrue();
});

test('#canSendEvent refuses the 31st event of a minute', () => {
  const sent = Array.from({ length: 30 }, (_, index) => 1_000_000 + index * 1500);

  expect(canSendEvent(sent, 1_000_000 + 30 * 1500)).toBeFalse();
});

test('#canSendEvent admits an event once the minute has passed', () => {
  const sent = Array.from({ length: 30 }, (_, index) => 1_000_000 + index * 1500);

  expect(canSendEvent(sent, 1_000_000 + 60_000 + 1)).toBeTrue();
});
