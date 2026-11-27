import { expect, test } from 'bun:test';
import { annotateRecipients } from './annotate-recipients';

test.each([
  {
    title: 'a permission by its words and none as no permission',
    list: 'sam@example.org, kirk@example.org, lee@example.org',
    permissions: new Map([
      ['sam@example.org', 'reply_target' as const],
      ['kirk@example.org', null],
    ]),
    expected: 'sam@example.org (reply target), kirk@example.org (no permission), lee@example.org',
  },
  { title: 'an empty list as it is', list: '', permissions: new Map(), expected: '' },
  {
    title: 'a missing list as missing',
    list: undefined,
    permissions: new Map(),
    expected: undefined,
  },
])('#annotateRecipients shows $title', (row) => {
  expect(annotateRecipients(row.list, row.permissions)).toBe(row.expected);
});
