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

// stored: the message IDs that nixie stored
test.each<[string, { messageID: string; receivedAt: number; stored: string[] }, string[]]>([
  ['a text after the cursor', { messageID: 'b', receivedAt: 2000, stored: [] }, ['b']],
  [
    'a text after the cursor that nixie stored, so a crash before its arrival delivers it again',
    { messageID: 'b', receivedAt: 2000, stored: ['b'] },
    ['b'],
  ],
  [
    'a text at the cursor that the cursor skips',
    { messageID: 'a', receivedAt: 1000, stored: ['a'] },
    [],
  ],
  [
    'a text at the cursor that the cursor does not skip',
    { messageID: 'c', receivedAt: 1000, stored: [] },
    ['c'],
  ],
  [
    'a late text behind the cursor that nixie has not stored',
    { messageID: 'd', receivedAt: 800, stored: [] },
    ['d'],
  ],
  [
    'a text behind the cursor that nixie stored',
    { messageID: 'd', receivedAt: 800, stored: ['d'] },
    [],
  ],
  ['a text at the floor of the first start', { messageID: 'e', receivedAt: 500, stored: [] }, []],
  [
    'a text before the floor of the first start',
    { messageID: 'e', receivedAt: 400, stored: [] },
    [],
  ],
])('#pickNewTexts given %s', (_name, read, expected) => {
  const ctx = setupTest();

  const fresh = pickNewTexts(
    [ctx.buildText(read.messageID, read.receivedAt)],
    { since: 1000, skip: ['a'], floor: 500 },
    new Set(read.stored),
  );

  expect(fresh.map((text) => text.messageID)).toStrictEqual(expected);
});
