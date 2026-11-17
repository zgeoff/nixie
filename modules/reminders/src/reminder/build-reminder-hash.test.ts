import { expect, test } from 'bun:test';
import { buildReminderHash } from './build-reminder-hash';

test('it hashes equal content equally, whatever else the caller passes along', () => {
  const version = {
    name: 'Tomatoes',
    note: 'Water the tomatoes.',
    trigger: { at: '2027-03-10T08:00:00Z' },
  };

  const set = { ...version, origin: 'conversation' };
  const update = { ...version, reminderID: 'r-1', shortID: 's-1' };

  expect(buildReminderHash(set)).toBe(buildReminderHash(version));
  expect(buildReminderHash(update)).toBe(buildReminderHash(version));
});

test('it hashes different content differently', () => {
  const trigger = { at: '2027-03-10T08:00:00Z' };

  expect(buildReminderHash({ name: 'A', note: 'x', trigger })).not.toBe(
    buildReminderHash({ name: 'A', note: 'y', trigger }),
  );
});
