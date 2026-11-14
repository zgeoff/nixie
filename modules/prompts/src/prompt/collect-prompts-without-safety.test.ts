import { expect, test } from 'bun:test';
import { collectPromptsWithoutSafety } from './collect-prompts-without-safety';

test('it finds no prompt without safety when nothing is overridden', () => {
  expect(collectPromptsWithoutSafety({})).toStrictEqual([]);
});

test('it finds no prompt without safety when an override keeps the built-in safety part', () => {
  expect(
    collectPromptsWithoutSafety({
      session: {
        parts: { instruction: 'Be brief.' },
        template: '{{ parts.instruction }}\n{{ parts.safety }}',
      },
    }),
  ).toStrictEqual([]);
});

test('it names a prompt whose safety part is replaced', () => {
  expect(
    collectPromptsWithoutSafety({
      writer: { parts: { safety: 'Quote the owner exactly.' }, template: null },
    }),
  ).toStrictEqual([{ id: 'writer', safety: 'replaced' }]);
});

test('it names a prompt whose template leaves the safety part out, even when that part is replaced', () => {
  expect(
    collectPromptsWithoutSafety({
      compaction: { parts: { safety: 'Summarise.' }, template: '{{ parts.instruction }}' },
    }),
  ).toStrictEqual([{ id: 'compaction', safety: 'omitted' }]);
});

test('it names each prompt without safety in registry order', () => {
  expect(
    collectPromptsWithoutSafety({
      compaction: { parts: {}, template: 'Summarise for {{ owner.name }}.' },
      'content-checker': { parts: { safety: 'Give a reason.' }, template: null },
    }),
  ).toStrictEqual([
    { id: 'content-checker', safety: 'replaced' },
    { id: 'compaction', safety: 'omitted' },
  ]);
});
