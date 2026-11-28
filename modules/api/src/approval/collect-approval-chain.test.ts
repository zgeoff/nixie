import { expect, test } from 'bun:test';
import { collectApprovalChain } from './collect-approval-chain';

function setupTest() {
  return {
    collect: (links: readonly (readonly [string, string | null])[], asking: string) =>
      collectApprovalChain(
        new Map(
          links.map(([id, startedBy]) => [
            id,
            { isConversation: id === 'conversation', createdSequence: 1, startedBy },
          ]),
        ),
        asking,
      ),
  };
}

test.each<{
  title: string;
  links: [string, string | null][];
  asking: string;
  chain: string[];
}>([
  {
    title: 'a task the conversation started',
    links: [
      ['conversation', null],
      ['task-a', 'conversation'],
    ],
    asking: 'task-a',
    chain: ['conversation', 'task-a'],
  },
  {
    title: 'a task that a task started, from the conversation down',
    links: [
      ['conversation', null],
      ['task-a', 'conversation'],
      ['task-b', 'task-a'],
    ],
    asking: 'task-b',
    chain: ['conversation', 'task-a', 'task-b'],
  },
  {
    title: 'the conversation alone',
    links: [['conversation', null]],
    asking: 'conversation',
    chain: ['conversation'],
  },
  {
    title: 'a task that nothing started',
    links: [['task-a', null]],
    asking: 'task-a',
    chain: ['task-a'],
  },
  { title: 'an ID with no row', links: [], asking: 'task-a', chain: ['task-a'] },
  {
    title: 'two tasks that started each other',
    links: [
      ['task-a', 'task-b'],
      ['task-b', 'task-a'],
    ],
    asking: 'task-a',
    chain: ['task-b', 'task-a'],
  },
  {
    title: 'a chain of 25 tasks, from the conversation down',
    links: [
      ['conversation', null],
      ...Array.from({ length: 25 }, (_, index): [string, string] => [
        `task-${String(index + 1)}`,
        index === 0 ? 'conversation' : `task-${String(index)}`,
      ]),
    ],
    asking: 'task-25',
    chain: [
      'conversation',
      ...Array.from({ length: 25 }, (_, index) => `task-${String(index + 1)}`),
    ],
  },
])('#collectApprovalChain lists $title', (row) => {
  const ctx = setupTest();

  expect(ctx.collect(row.links, row.asking)).toStrictEqual(row.chain);
});
