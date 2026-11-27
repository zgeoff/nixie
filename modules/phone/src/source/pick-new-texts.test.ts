import { expect, test } from 'bun:test';
import type { ProviderText } from '../types';
import { pickNewTexts } from './pick-new-texts';

function setupTest() {
  return {
    buildText: (messageID: string, receivedAt: number): ProviderText => ({
      messageID,
      from: 'Example',
      receivedAt,
      precisionMs: 1,
      body: 'Hello',
    }),
  };
}

test.each<[string, string, number, string[]]>([
  ['a text after the cursor', 'b', 2000, ['b']],
  ['a text before the cursor', 'a', 500, []],
  ['a text at the cursor that the cursor skips', 'a', 1000, []],
  ['a text at the cursor that the cursor does not skip', 'c', 1000, ['c']],
])('#pickNewTexts takes %s', (_name, messageID, receivedAt, expected) => {
  const ctx = setupTest();
  const fresh = pickNewTexts([ctx.buildText(messageID, receivedAt)], { since: 1000, skip: ['a'] });

  expect(fresh.map((text) => text.messageID)).toStrictEqual(expected);
});
