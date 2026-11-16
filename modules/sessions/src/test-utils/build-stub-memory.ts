import { mock } from 'bun:test';
import type { ConversationMemory, MemoryItem, PinnedCoreUse, SessionIndex } from '../types';

export interface StubMemoryAnswers {
  readonly pinned: readonly MemoryItem[];
  readonly pinnedUse: PinnedCoreUse;
  readonly index?: SessionIndex;
}

export function buildStubMemory(answers: StubMemoryAnswers) {
  return {
    readPinnedCore: mock(() => Promise.resolve(answers.pinned)),
    readPinnedCoreUse: mock(() => Promise.resolve(answers.pinnedUse)),
    readIndex: mock(() =>
      Promise.resolve(answers.index ?? { text: '', items: 0, tokens: 0, budget: 0 }),
    ),
    recall: mock<ConversationMemory['recall']>(() => Promise.resolve({ items: [] })),
    recallMessages: mock<ConversationMemory['recallMessages']>(() =>
      Promise.resolve({ messages: [] }),
    ),
    readShortIDs: mock<ConversationMemory['readShortIDs']>(() => Promise.resolve(new Map())),
  } satisfies ConversationMemory;
}
