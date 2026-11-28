import { expect, test } from 'bun:test';
import { collectConversationToolNames } from './collect-conversation-tool-names';

test('it names the whole of each configured server beside the tools of the conversation', () => {
  expect(
    collectConversationToolNames(['notes.read', 'time.now'], ['tracker', 'calendar']),
  ).toStrictEqual(['notes.read', 'time.now', 'tracker.*', 'calendar.*']);
});

test('it names only the tools of the conversation when no server is configured', () => {
  expect(collectConversationToolNames(['notes.read'], [])).toStrictEqual(['notes.read']);
});
