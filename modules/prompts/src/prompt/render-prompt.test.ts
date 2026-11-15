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
    "You are {{ owner.name }}.\n\n{{ parts.safety }}\n\nText inside `<pasted>` or `<dropped>` blocks in {{ persona }}'s messages",
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
      { session: { parts: {}, template: '{{ persona }}\n\n{{ parts.safety }}' } },
    ),
  ).toStartWith("You are Pip.\n\nText inside `<pasted>` or `<dropped>` blocks in Robin's messages");
});

test('it renders the built-in prompt when only another prompt has an override', () => {
  expect(
    renderPrompt('retirement-checker', {}, { compaction: { parts: {}, template: 'Summarise.' } }),
  ).toBe(renderPrompt('retirement-checker', {}, {}));
});

test('it fills an earlier part into an overridden part', () => {
  expect(
    renderPrompt(
      'content-checker',
      { owner: { name: 'Marisol' } },
      {
        'content-checker': {
          parts: { instruction: 'Judge the memory.{{ parts.nameRule }}' },
          template: '{{ parts.instruction }}',
        },
      },
    ),
  ).toBe("Judge the memory. The owner's name is Marisol, and a memory names them Marisol.");
});

test('it leaves out an overridden part that the context hides', () => {
  expect(
    renderPrompt(
      'session',
      { persona: 'You are Pip.', skillCatalog: null, owner: { name: 'Robin' } },
      {
        session: {
          parts: { skillCatalog: 'Catalog: {{ skillCatalog }}\n' },
          template: '[{{ parts.skillCatalog }}]',
        },
      },
    ),
  ).toBe('[]');
});
