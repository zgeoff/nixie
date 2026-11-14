import { expect, test } from 'bun:test';
import { buildSkillOverlay } from './build-skill-overlay';

test('it adds a new written skill to the skills and to the conversation list', () => {
  const overlay = buildSkillOverlay({
    skills: [{ name: 'bird-log', skillHash: 'hash-bird', origin: 'definitions' }],
    conversationSkills: [],
    written: [
      { approvalID: 'approval-a', name: 'tide-tables', skillHash: 'hash-tide', base: null },
    ],
  });

  expect(overlay).toStrictEqual({
    skills: [
      { name: 'bird-log', skillHash: 'hash-bird', origin: 'definitions', approvalID: null },
      { name: 'tide-tables', skillHash: 'hash-tide', origin: 'nixie', approvalID: 'approval-a' },
    ],
    conversationSkills: ['tide-tables'],
    adopted: [],
    beneath: new Map([['approval-a', null]]),
  });
});

test('it replaces the definitions version and keeps its place off the conversation list', () => {
  const overlay = buildSkillOverlay({
    skills: [{ name: 'tide-tables', skillHash: 'hash-old', origin: 'vendored' }],
    conversationSkills: [],
    written: [
      {
        approvalID: 'approval-a',
        name: 'tide-tables',
        skillHash: 'hash-new',
        base: { name: 'tide-tables', skillHash: 'hash-old', origin: 'vendored' },
      },
    ],
  });

  expect(overlay).toStrictEqual({
    skills: [
      { name: 'tide-tables', skillHash: 'hash-new', origin: 'nixie', approvalID: 'approval-a' },
    ],
    conversationSkills: [],
    adopted: [],
    beneath: new Map([
      ['approval-a', { name: 'tide-tables', skillHash: 'hash-old', origin: 'vendored' }],
    ]),
  });
});

test('it hands a written skill to the definitions once they hold its version', () => {
  const written = {
    approvalID: 'approval-a',
    name: 'tide-tables',
    skillHash: 'hash-new',
    base: null,
  };

  const overlay = buildSkillOverlay({
    skills: [{ name: 'tide-tables', skillHash: 'hash-new', origin: 'definitions' }],
    conversationSkills: ['tide-tables'],
    written: [written],
  });

  expect(overlay).toStrictEqual({
    skills: [
      { name: 'tide-tables', skillHash: 'hash-new', origin: 'definitions', approvalID: null },
    ],
    conversationSkills: ['tide-tables'],
    adopted: [written],
    beneath: new Map(),
  });
});

test('it keeps a written skill over a definitions version that changed since its base', () => {
  const overlay = buildSkillOverlay({
    skills: [{ name: 'tide-tables', skillHash: 'hash-edited', origin: 'definitions' }],
    conversationSkills: ['tide-tables'],
    written: [
      {
        approvalID: 'approval-a',
        name: 'tide-tables',
        skillHash: 'hash-new',
        base: { name: 'tide-tables', skillHash: 'hash-old', origin: 'definitions' },
      },
    ],
  });

  expect(overlay.skills).toStrictEqual([
    { name: 'tide-tables', skillHash: 'hash-new', origin: 'nixie', approvalID: 'approval-a' },
  ]);

  expect(overlay.beneath).toStrictEqual(
    new Map([
      ['approval-a', { name: 'tide-tables', skillHash: 'hash-edited', origin: 'definitions' }],
    ]),
  );
});
