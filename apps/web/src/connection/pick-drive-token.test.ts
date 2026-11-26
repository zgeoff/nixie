import { expect, test } from 'bun:test';
import { pickDriveToken } from './pick-drive-token';

test('#pickDriveToken accepts a token whose only scope is drive.file', () => {
  expect(
    pickDriveToken({
      accessToken: 'token-1',
      scope: 'https://www.googleapis.com/auth/drive.file',
    }),
  ).toStrictEqual({ kind: 'ok', token: 'token-1' });
});

test.each([
  { title: 'a token with no scope', answer: { accessToken: 'token-1', scope: null } },
  { title: 'no token', answer: { accessToken: null, scope: 'x' } },
  {
    title: 'a token that also holds the mail scope',
    answer: {
      accessToken: 'token-1',
      scope:
        'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/gmail.modify',
    },
  },
  {
    title: 'a token for another scope',
    answer: { accessToken: 'token-1', scope: 'https://www.googleapis.com/auth/drive' },
  },
])('#pickDriveToken refuses $title', (row) => {
  expect(pickDriveToken(row.answer).kind).toBe('refused');
});
