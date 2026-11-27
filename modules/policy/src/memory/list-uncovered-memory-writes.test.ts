import { expect, test } from 'bun:test';
import { isRuleMatch } from '../rule/is-rule-match';
import type { Rule, RuleCall, RuleContext, RuleSource } from '../types';
import type { RuleNeed } from './is-need-met';
import { isNeedMet } from './is-need-met';
import { listUncoveredMemoryWrites } from './list-uncovered-memory-writes';

test('#listUncoveredMemoryWrites gives a rule by tool name and a rule by effect the same list', () => {
  const byTool: Rule = {
    id: 'by-tool',
    outcome: 'allow',
    tools: ['memory.remember', 'memory.edit', 'memory.retire', 'memory.pin'],
  };

  const byEffect: Rule = { id: 'by-effect', outcome: 'allow', effects: ['memory_write'] };

  expect(listUncoveredMemoryWrites(byTool)).toStrictEqual(listUncoveredMemoryWrites(byEffect));
});

test('#listUncoveredMemoryWrites lists the self-notes and photo writes that a plain rule leaves', () => {
  const rule: Rule = { id: 'plain', outcome: 'allow', effects: ['memory_write'] };

  expect(listUncoveredMemoryWrites(rule)).toStrictEqual([
    'a new self-note',
    'a self-note text edit',
    'a self-note label edit',
    'a move of an item into self',
    'a re-file of items into self',
    'a write from a photo',
  ]);
});

test('#listUncoveredMemoryWrites counts a re-file as covered by a rule that names memory.edit', () => {
  const rule: Rule = { id: 'edits', outcome: 'allow', tools: ['memory.edit'] };
  const uncovered = listUncoveredMemoryWrites(rule);

  expect(uncovered).toContain('a re-file of items into self');
  expect(uncovered).not.toContain('a re-file of items to another topic');
});

test('#listUncoveredMemoryWrites lists every other kind for a rule on one tool', () => {
  const rule: Rule = { id: 'pins', outcome: 'allow', tools: ['memory.pin'] };

  expect(listUncoveredMemoryWrites(rule)).toStrictEqual([
    'a new fact',
    'a text edit',
    'a label-only edit',
    'a new self-note',
    'a self-note text edit',
    'a self-note label edit',
    'a move of an item into self',
    'a move of an item out of self',
    'a re-file of items to another topic',
    'a re-file of items into self',
    'a write from a photo',
    'a retirement',
  ]);
});

test('#listUncoveredMemoryWrites leaves only the kinds outside self for a rule that checks subject eq self', () => {
  const rule: Rule = {
    id: 'self',
    outcome: 'allow',
    effects: ['memory_write'],
    checks: [{ arg: 'subject', op: 'eq', value: 'self' }],
  };

  expect(listUncoveredMemoryWrites(rule)).toStrictEqual([
    'a new fact',
    'a text edit',
    'a label-only edit',
    'a move of an item out of self',
    'a re-file of items to another topic',
    'a write from a photo',
  ]);
});

test('#listUncoveredMemoryWrites covers a photo write for a rule with an image check', () => {
  const rule: Rule = {
    id: 'photo',
    outcome: 'allow',
    effects: ['memory_write'],
    checks: [{ arg: 'image.eventID', op: 'eq', value: '41' }],
  };

  expect(listUncoveredMemoryWrites(rule)).toStrictEqual([
    'a new fact',
    'a text edit',
    'a label-only edit',
    'a new self-note',
    'a self-note text edit',
    'a self-note label edit',
    'a move of an item into self',
    'a move of an item out of self',
    'a re-file of items to another topic',
    'a re-file of items into self',
    'a pin',
    'a retirement',
  ]);
});

test('#listUncoveredMemoryWrites names the place that a rule for the conversation leaves out', () => {
  const rule: Rule = {
    id: 'conversation',
    outcome: 'allow',
    effects: ['memory_write'],
    contexts: ['conversation'],
  };

  const uncovered = listUncoveredMemoryWrites(rule);

  expect(uncovered).toContain('a new fact from a task');
  expect(uncovered).toContain('a pin from a task');
  expect(uncovered).not.toContain('a new fact from the conversation');
});

test('#listUncoveredMemoryWrites lists a pin for a rule that needs an owner source', () => {
  const rule: Rule = {
    id: 'owner-words',
    outcome: 'allow',
    effects: ['memory_write'],
    sources: ['owner'],
  };

  const uncovered = listUncoveredMemoryWrites(rule);

  expect(uncovered).toContain('a pin');
  expect(uncovered).toContain('a label-only edit');
  expect(uncovered).not.toContain('a new fact');
});

test('#listUncoveredMemoryWrites ignores a check on an argument other than subject or image', () => {
  const plain: Rule = { id: 'plain', outcome: 'allow', effects: ['memory_write'] };

  const narrowed: Rule = {
    ...plain,
    id: 'narrowed',
    checks: [{ arg: 'text', op: 'matches', value: 'Likes *' }],
  };

  expect(listUncoveredMemoryWrites(narrowed)).toStrictEqual(listUncoveredMemoryWrites(plain));
});

test('#listUncoveredMemoryWrites counts a rule that has expired the same as one that lasts', () => {
  const expired: Rule = {
    id: 'expired',
    outcome: 'allow',
    effects: ['memory_write'],
    expires: '2020-01-01T00:00:00Z',
  };

  const lasting: Rule = { ...expired, id: 'lasting', expires: '2999-01-01T00:00:00Z' };

  expect(listUncoveredMemoryWrites(expired)).toStrictEqual(listUncoveredMemoryWrites(lasting));
});

test.each<[string, Rule]>([
  ['a deny rule', { id: 'deny', outcome: 'deny', effects: ['memory_write'] }],
  ['an ask rule', { id: 'ask', outcome: 'ask', tools: ['memory.edit'] }],
  ['a rule on send', { id: 'send', outcome: 'allow', tools: ['mail.send'] }],
  ['a rule on the note effect', { id: 'note', outcome: 'allow', effects: ['note'] }],
])('#listUncoveredMemoryWrites gives an empty list for %s', (_name, rule) => {
  expect(listUncoveredMemoryWrites(rule)).toStrictEqual([]);
});

interface RealWrite {
  readonly phrase: string;
  readonly tool: string;
  readonly need: RuleNeed;

  // each call the tool's policy facts can give the write, as subject and sources
  readonly calls: readonly (readonly [string, readonly RuleSource[]])[];
}

// In each place, the list names a write exactly when no call the write can make there, matched by
// the decision point's own isRuleMatch, meets the write's need.
test.each<[string, Rule]>([
  ['plain', { id: 'plain', outcome: 'allow', effects: ['memory_write'] }],
  [
    'self',
    {
      id: 'self',
      outcome: 'allow',
      effects: ['memory_write'],
      checks: [{ arg: 'subject', op: 'eq', value: 'self' }],
    },
  ],
  [
    'owner-only',
    {
      id: 'owner-only',
      outcome: 'allow',
      tools: ['memory.pin', 'memory.retire'],
      checks: [{ arg: 'subject', op: 'eq', value: 'owner' }],
    },
  ],
  [
    'owner-words',
    { id: 'owner-words', outcome: 'allow', effects: ['memory_write'], sources: ['owner'] },
  ],
  ['remember', { id: 'remember', outcome: 'allow', tools: ['memory.remember'] }],
])('#listUncoveredMemoryWrites agrees with isRuleMatch and isNeedMet for rule %s', (_id, rule) => {
  const realWrites: readonly RealWrite[] = [
    {
      phrase: 'a pin',
      tool: 'memory.pin',
      need: 'none',
      calls: [
        ['owner', []],
        ['shared', []],
        ['self', []],
      ],
    },
    {
      phrase: 'a retirement',
      tool: 'memory.retire',
      need: 'none',
      calls: [
        ['owner', ['owner']],
        ['shared', ['outside']],
        ['self', ['outside']],
      ],
    },
    {
      phrase: 'a new self-note',
      tool: 'memory.remember',
      need: 'self_note',
      calls: [['self', ['outside']]],
    },
  ];

  const places: readonly (readonly [RuleContext, readonly RuleSource[], string])[] = [
    ['conversation', [], ' from the conversation'],
    ['task', ['task'], ' from a task'],
  ];

  const lines = listUncoveredMemoryWrites(rule);

  for (const write of realWrites) {
    for (const [context, extra, suffix] of places) {
      const isCovered = write.calls.some(([subject, sources]) => {
        const call: RuleCall = {
          tool: write.tool,
          effects: ['memory_write'],
          context,
          task: context === 'task' ? 'tidy' : null,
          args: { itemID: 'k3v9qm2xw1', subject },
          destinations: [],
          sources: [...sources, ...extra],
          contentArgs: [],
          at: Date.parse('2026-11-17T00:00:00Z'),
        };

        return isRuleMatch(rule, call) && isNeedMet({ checks: rule.checks ?? [] }, write.need);
      });

      const isListed = lines.includes(write.phrase) || lines.includes(`${write.phrase}${suffix}`);

      expect({ write: write.phrase, context, isListed }).toStrictEqual({
        write: write.phrase,
        context,
        isListed: !isCovered,
      });
    }
  }
});
