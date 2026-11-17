import { expect, test } from 'bun:test';
import { parseDefinitions } from '../definition/parse-definitions';
import { buildTestTaskSeed } from '../test-utils/build-test-task-seed';
import { buildTestTaskYaml } from '../test-utils/build-test-task-yaml';
import { collectRaiseBlockers } from './collect-raise-blockers';

function setupTest() {
  const encoder = new TextEncoder();

  const tasks = buildTestTaskSeed();

  return {
    parseAt: (format: number, files: Readonly<Record<string, string>>, manifest = '') => {
      const texts = {
        'nixie.yaml': `format: ${String(format)}\n${manifest}`,
        'persona.md': '# Persona\n',
        ...files,
      };

      const encoded = Object.entries(texts).map(([path, text]): [string, Uint8Array] => [
        path,
        encoder.encode(text),
      ]);

      return parseDefinitions(
        { contentHash: '', files: new Map(encoded), revision: 'r', repository: null, skipped: [] },
        tasks,
      );
    },
  };
}

test('it names no file for a format 3 repo whose rules, prompts and skills read the same under format 4', () => {
  const files = {
    'rules/mail.yaml': 'allow-mail-to-team:\n  outcome: allow\n  tools: [mail.send]\n',
    'prompts/safety.md': 'Quote {{ owner.name }} exactly.\n',
    'skills/tide-tables/SKILL.md':
      '---\nname: tide-tables\ndescription: Reads a tide table.\n---\n# Tides\n',
    'notes.md': '# Notes\n',
  };

  const manifest = 'prompts:\n  task:\n    safety: prompts/safety.md\n';
  const ctx = setupTest();
  const before = ctx.parseAt(3, files, manifest);
  const after = ctx.parseAt(4, files, manifest);

  expect(before.rules).toHaveLength(1);

  expect({
    rules: after.rules,
    ruleWarnings: after.ruleWarnings,
    prompts: after.prompts,
    skills: after.skills,
  }).toStrictEqual({
    rules: before.rules,
    ruleWarnings: before.ruleWarnings,
    prompts: before.prompts,
    skills: before.skills,
  });

  expect(collectRaiseBlockers(before, after)).toStrictEqual([]);
});

test('it names an effects file and a task folder written by hand that format 4 would apply', () => {
  const files = {
    'effects/mail.yaml': 'mail.draft:\n  add: [write]\n',
    'tasks/feed-the-cat/task.yaml': buildTestTaskYaml(),
  };

  const ctx = setupTest();
  const before = ctx.parseAt(3, files);
  const after = ctx.parseAt(4, files);

  expect(collectRaiseBlockers(before, after)).toStrictEqual([
    'effects/mail.yaml',
    'tasks/feed-the-cat/task.yaml',
  ]);
});

test('it names the prompts map and the files that format 2 leaves unapplied', () => {
  const files = {
    'rules/mail.yaml': 'allow-mail-to-team:\n  outcome: allow\n  tools: [mail.send]\n',
    'prompts/safety.md': 'Quote {{ owner.name }} exactly.\n',
  };

  const manifest = 'prompts:\n  task:\n    safety: prompts/safety.md\n';
  const ctx = setupTest();
  const before = ctx.parseAt(2, files, manifest);
  const after = ctx.parseAt(4, files, manifest);

  expect(collectRaiseBlockers(before, after)).toStrictEqual([
    'the `prompts:` map in nixie.yaml',
    'prompts/safety.md',
    'rules/mail.yaml',
  ]);
});
