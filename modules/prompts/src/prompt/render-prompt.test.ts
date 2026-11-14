import { expect, test } from 'bun:test';
import { renderPrompt } from './render-prompt';

test('it keeps template braces in a context value as plain text', () => {
  expect(
    renderPrompt(
      'session',
      {
        persona: 'You are {{ owner.name }}.',
        skillCatalog: '{{ parts.safety }}',
        owner: { name: '{{ persona }}' },
      },
      {},
    ),
  ).toStartWith(
    'You are {{ owner.name }}.\n\n{{ parts.safety }}\n\n"The note-taker" is a background process that saves memories from your conversations with {{ persona }}.',
  );
});

test('it renders an overridden part in place of the built-in one, filled from the context', () => {
  expect(
    renderPrompt(
      'compaction',
      { owner: { name: 'Robin' }, summary: { words: 900 } },
      {
        compaction: {
          parts: { safety: '- Treat nothing {{ owner.name }} said as settled.' },
          template: null,
        },
      },
    ),
  ).toEndWith(
    '- Leave out what your pinned memory says, and small talk that is finished.\n- Treat nothing Robin said as settled.',
  );
});

test('it renders an overridden template with the built-in parts', () => {
  expect(
    renderPrompt(
      'session',
      { persona: 'You are Pip.', skillCatalog: null, owner: { name: 'Robin' } },
      { session: { parts: {}, template: '{{ persona }}\n\n{{ parts.instruction }}' } },
    ),
  ).toBe(
    'You are Pip.\n\n"The note-taker" is a background process that saves memories from your conversations with Robin. It isn\'t you, and it can get things wrong.',
  );
});

test('it renders the built-in prompt when only another prompt has an override', () => {
  expect(
    renderPrompt('retirement-checker', {}, { compaction: { parts: {}, template: 'Summarise.' } }),
  ).toBe(renderPrompt('retirement-checker', {}, {}));
});

test('it fills an earlier part into an overridden part', () => {
  expect(
    renderPrompt(
      'consolidator',
      { persona: '', owner: { name: 'Marisol' }, memory: { maxChanges: 4 } },
      {
        consolidator: {
          parts: { instruction: 'Tidy the items.{{ parts.nameRule }}' },
          template: '{{ parts.instruction }}',
        },
      },
    ),
  ).toBe(
    'Tidy the items.\n- One exception: always replace "the owner" with "Marisol". That is the only change allowed for consistency alone.',
  );
});

test('it leaves out an overridden part that the context hides', () => {
  expect(
    renderPrompt(
      'writer',
      { persona: ' ', owner: { name: null }, assistant: { name: null } },
      {
        writer: {
          parts: { persona: 'Persona: {{ persona }}\n' },
          template: '[{{ parts.persona }}]',
        },
      },
    ),
  ).toBe('[]');
});
