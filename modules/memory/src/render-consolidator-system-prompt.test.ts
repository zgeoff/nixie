import { expect, test } from 'bun:test';
import { renderConsolidatorSystemPrompt } from './render-consolidator-system-prompt';

test('it puts the persona before the rules', () => {
  expect(renderConsolidatorSystemPrompt('  You are Nix.  ', 30)).toStartWith(
    'You are Nix.\n\nYou tidy',
  );
});

test('it gives the rules alone when no persona is in force', () => {
  expect(renderConsolidatorSystemPrompt('', 30)).toStartWith('You tidy the long-term memory');
});

test('it tells the model never to forget and to call memory.consolidate once', () => {
  const prompt = renderConsolidatorSystemPrompt('', 30);

  expect(prompt).toInclude('Never forget an item.');
  expect(prompt).toInclude('Call memory.consolidate once with the whole diff');
});

test('it tells the model the cap on changes it is given', () => {
  expect(renderConsolidatorSystemPrompt('', 5)).toInclude('propose at most 5 changes.');
});
