import { expect, test } from 'bun:test';
import { pickDriveFilesRefusal } from './pick-drive-files-refusal';

test('#pickDriveFilesRefusal accepts one file with the expected name and text', () => {
  expect(
    pickDriveFilesRefusal([{ name: 'Notes', mimeType: 'text/plain', text: 'Hello.' }], {
      name: 'Notes',
      text: 'Hello.',
    }),
  ).toBeNull();
});

test.each([
  { title: 'no file', files: [], expected: 'the fake Drive holds 0 files named Notes, not 1' },
  {
    title: 'a double create',
    files: [
      { name: 'Notes', mimeType: 'text/plain', text: 'Hello.' },
      { name: 'Notes', mimeType: 'text/plain', text: 'Hello.' },
    ],
    expected: 'the fake Drive holds 2 files named Notes, not 1',
  },
  {
    title: 'other text',
    files: [{ name: 'Notes', mimeType: 'text/plain', text: 'Bye.' }],
    expected: 'the file Notes holds other text than expected',
  },
])('#pickDriveFilesRefusal refuses $title', (row) => {
  expect(pickDriveFilesRefusal(row.files, { name: 'Notes', text: 'Hello.' })).toBe(row.expected);
});
