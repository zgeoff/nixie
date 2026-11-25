import { expect, test } from 'bun:test';
import { countStoredAttachments, maxAttachmentBytes } from './count-stored-attachments';

test.each([
  ['no attachment', [], 0],
  ['attachments that fit', [1000, 2000], 2],
  ['attachments that fill the limit exactly', [maxAttachmentBytes - 1, 1], 2],
  ['an attachment past the limit', [maxAttachmentBytes + 1], 0],
  ['a small attachment after one that did not fit', [10, maxAttachmentBytes, 5], 1],
])('#countStoredAttachments keeps %s', (_name, sizes, expected) => {
  expect(countStoredAttachments(sizes)).toBe(expected);
});
