import { expect, test } from 'bun:test';
import { pickGrantedShortScopes } from './pick-granted-short-scopes';

test.each([
  {
    title: 'strips the prefix',
    granted: [`https://www.googleapis.com/auth/gmail.modify`],
    expected: ['gmail.modify'],
  },
  {
    title: 'leaves out identity scopes',
    granted: ['openid', 'email', `https://www.googleapis.com/auth/drive.file`],
    expected: ['drive.file'],
  },
  {
    title: 'leaves out a scope nixie did not ask for',
    granted: [
      `https://www.googleapis.com/auth/gmail.modify`,
      `https://www.googleapis.com/auth/contacts`,
    ],
    expected: ['gmail.modify'],
  },
  { title: 'keeps nothing from an empty answer', granted: [], expected: [] },
])('#pickGrantedShortScopes $title', (row) => {
  expect(
    pickGrantedShortScopes(row.granted, 'https://www.googleapis.com/auth/', [
      'gmail.modify',
      'drive.file',
    ]),
  ).toStrictEqual([...row.expected]);
});
