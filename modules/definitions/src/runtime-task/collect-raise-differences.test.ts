import { expect, test } from 'bun:test';
import { parseDefinitions } from '../definition/parse-definitions';
import { buildTestTaskSeed } from '../test-utils/build-test-task-seed';
import { collectRaiseDifferences } from './collect-raise-differences';

function setupTest() {
  const encoder = new TextEncoder();

  const tasks = buildTestTaskSeed();

  return {
    parseAt: (format: number, files: Readonly<Record<string, string>>) => {
      const texts = {
        'nixie.yaml': `format: ${String(format)}\n`,
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

test('it names no kind for a format 3 repo whose files read the same under format 4', () => {
  const files = {
    'rules/mail.yaml': 'allow-mail-to-team:\n  outcome: allow\n  tools: [mail.send]\n',
    'notes.md': '# Notes\n',
  };

  const ctx = setupTest();
  const before = ctx.parseAt(3, files);
  const after = ctx.parseAt(4, files);

  expect(collectRaiseDifferences(before, after)).toStrictEqual([]);
});

test('it names the effects kind when a file under effects/ starts to apply', () => {
  const files = { 'effects/mail.yaml': 'mail.draft:\n  add: [write]\n' };
  const ctx = setupTest();
  const before = ctx.parseAt(3, files);
  const after = ctx.parseAt(4, files);

  expect(collectRaiseDifferences(before, after)).toStrictEqual(['effects', 'unapplied files']);
});
