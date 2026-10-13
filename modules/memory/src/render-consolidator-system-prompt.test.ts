import { expect, test } from 'bun:test';
import { renderConsolidatorSystemPrompt } from './render-consolidator-system-prompt';

test('it puts the persona before the rules', () => {
  expect(renderConsolidatorSystemPrompt('  You are Nix.  ')).toStartWith(
    'You are Nix.\n\nYou tidy',
  );
});

test('it gives the rules alone when no persona is in force', () => {
  expect(renderConsolidatorSystemPrompt('')).toStartWith('You tidy the long-term memory');
});

test('it tells the model never to forget and to call memory.consolidate once', () => {
  const prompt = renderConsolidatorSystemPrompt('');

  expect(prompt).toInclude('Never forget an item.');
  expect(prompt).toInclude('Call memory.consolidate once with the whole diff');
});
