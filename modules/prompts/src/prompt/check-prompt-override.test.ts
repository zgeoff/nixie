import { expect, test } from 'bun:test';
import { checkPromptOverride } from './check-prompt-override';

test('it accepts parts and a template that read only the paths the prompt has', () => {
  expect(
    checkPromptOverride('consolidator', {
      parts: {
        instruction: 'Tidy what {{ owner.name }} keeps.{{ parts.nameRule }}',
        safety: 'Propose at most {{ memory.maxChanges }} changes.',
      },
      template: '{{ persona }}\n{{ parts.persona }}{{ parts.instruction }}\n{{ parts.safety }}',
    }),
  ).toStrictEqual([]);
});

test('it reports a path that the template reads and the prompt does not have', () => {
  expect(
    checkPromptOverride('compaction', { parts: {}, template: '{{ parts.safety }} {{ persona }}' }),
  ).toStrictEqual([
    {
      part: null,
      reason:
        'the template of the compaction prompt reads {{ persona }}, which it does not accept; it accepts owner.name, owner.nameAtSentenceStart, summary.words, parts.instruction, parts.safety',
    },
  ]);
});

test('it reports a path that a part reads and the prompt does not have, once however often it appears', () => {
  expect(
    checkPromptOverride('retirement-checker', {
      parts: { instruction: 'Ask {{ owner.name }}, then ask {{owner.name}} again.' },
      template: null,
    }),
  ).toStrictEqual([
    {
      part: 'instruction',
      reason:
        'the instruction part of the retirement-checker prompt reads {{ owner.name }}, which it does not accept; it accepts no path',
    },
  ]);
});

test('it reports a part that reads itself or a later part', () => {
  expect(
    checkPromptOverride('content-checker', {
      parts: { instruction: 'Judge it. {{ parts.instruction }} {{ parts.safety }}' },
      template: null,
    }),
  ).toStrictEqual([
    {
      part: 'instruction',
      reason:
        'the instruction part of the content-checker prompt reads {{ parts.instruction }}, which it does not accept; it accepts owner.name, owner.nameAtSentenceStart, parts.nameRule',
    },
    {
      part: 'instruction',
      reason:
        'the instruction part of the content-checker prompt reads {{ parts.safety }}, which it does not accept; it accepts owner.name, owner.nameAtSentenceStart, parts.nameRule',
    },
  ]);
});
