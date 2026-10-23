import { expect, test } from 'bun:test';
import { renderPrompt } from './render-prompt';

test('it keeps template braces in a context value as plain text', () => {
  expect(
    renderPrompt('session', {
      persona: 'You are {{ owner.name }}.',
      skillCatalog: '{{ parts.safety }}',
      owner: { name: '{{ persona }}' },
    }),
  ).toStartWith(
    'You are {{ owner.name }}.\n\n{{ parts.safety }}\n\n"The note-taker" is a background process that saves memories from your conversations with {{ persona }}.',
  );
});
