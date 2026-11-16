import { expect, test } from 'bun:test';
import { buildMockDefinitionNotice } from '../test-utils/build-mock-definition-notice';
import { formatDefinitionNotice } from './format-definition-notice';

test.each([
  [
    'an add in force',
    buildMockDefinitionNotice(),
    'Scheduled: Water the tomatoes, every Friday at 08:00 (next: Fri 12 Mar).',
  ],
  [
    'a change in force',
    buildMockDefinitionNotice({ operation: 'change' }),
    'Changed: Water the tomatoes, every Friday at 08:00 (next: Fri 12 Mar).',
  ],
  [
    'an adopted add',
    buildMockDefinitionNotice({ state: 'adopted' }),
    'Scheduled: Water the tomatoes, every Friday at 08:00 (next: Fri 12 Mar).',
  ],
  [
    'an add with no next fire',
    buildMockDefinitionNotice({ next: null }),
    'Scheduled: Water the tomatoes, every Friday at 08:00.',
  ],
  [
    'a removal',
    buildMockDefinitionNotice({ operation: 'remove', rendered: null, next: null }),
    'Removed: Water the tomatoes.',
  ],
  [
    'an undo that restores a trigger',
    buildMockDefinitionNotice({ operation: 'undo' }),
    'Undone: Water the tomatoes, now every Friday at 08:00 (next: Fri 12 Mar).',
  ],
  [
    'an undo that removes the definition',
    buildMockDefinitionNotice({ operation: 'undo', rendered: null, next: null }),
    'Undone: Water the tomatoes, removed.',
  ],
  [
    'a superseded add',
    buildMockDefinitionNotice({ state: 'superseded', next: null }),
    'Scheduled: Water the tomatoes, every Friday at 08:00 (superseded).',
  ],
  [
    'a retired add',
    buildMockDefinitionNotice({ state: 'retired', next: null }),
    'Scheduled: Water the tomatoes, every Friday at 08:00 (retired).',
  ],
  [
    'an unreadable add',
    buildMockDefinitionNotice({ isUnreadable: true, name: null, rendered: null, next: null }),
    'Scheduled: [content unavailable].',
  ],
])('it words %s', (_title, notice, sentence) => {
  expect(formatDefinitionNotice(notice)).toBe(sentence);
});
