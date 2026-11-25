import { expect, test } from 'bun:test';
import { cleanAttachmentName } from './clean-attachment-name';

test.each([
  ['a plain name', 'board.png', 'board.png'],
  ['a name with a folder', '../../etc/passwd', 'passwd'],
  ['a name with a Windows folder', String.raw`C:\Users\a\plan.pdf`, 'plan.pdf'],
  ['a name with control characters', 'a\r\nb.txt', 'ab.txt'],
  ['an empty name', '', 'attachment'],
  ['a dot name', '..', 'attachment'],
  ['a name past the limit', `${'x'.repeat(300)}.txt`, 'x'.repeat(200)],
])('#cleanAttachmentName keeps %s as a safe name', (_name, claimed, expected) => {
  expect(cleanAttachmentName(claimed)).toBe(expected);
});
