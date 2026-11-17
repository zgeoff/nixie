import { expect, test } from 'bun:test';
import type { Rule } from '../types';
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
    'a write from a photo',
  ]);
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
    'a write from a photo',
    'a pin',
    'a retirement',
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
