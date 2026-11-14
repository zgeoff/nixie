import { expect, test } from 'bun:test';
import { buildTestToolDeclaration } from './build-test-tool-declaration';

test('it builds a tool that sends and writes under the name it is given', () => {
  expect(buildTestToolDeclaration('mail.draft')).toStrictEqual({
    name: 'mail.draft',
    effects: ['send', 'write'],
    destinations: [],
    amount: null,
    content: [],
    results: {},
  });
});
