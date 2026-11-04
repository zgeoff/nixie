import { expect, test } from 'bun:test';
import { renderPrompt } from '@heynixie/prompts';
import { renderSessionPrompt } from './render-session-prompt';

test('it renders the session prompt with the persona and the skill catalog for the conversation', () => {
  const prompt = renderSessionPrompt(
    { kind: 'conversation' },
    {
      taskID: 'conversation',
      persona: 'You are nixie.',
      skillCatalog: 'Skills: tide-tables.',
      ownerName: 'Robin',
      messaging: { directory: [] },
      prompts: {},
    },
  );

  expect(prompt).toBe(
    renderPrompt(
      'session',
      { persona: 'You are nixie.', skillCatalog: 'Skills: tide-tables.', owner: { name: 'Robin' } },
      {},
    ),
  );
});

test("it renders the task prompt with the task's name and brief from the directory", () => {
  const prompt = renderSessionPrompt(
    { kind: 'task', startedBy: 'conversation', report: 'wake' },
    {
      taskID: 'k3vq8m2xpa',
      persona: '',
      skillCatalog: null,
      ownerName: 'Robin',
      messaging: {
        directory: [
          {
            taskID: 'k3vq8m2xpa',
            name: 'Tide tables',
            brief: 'Find the high tides for Saturday.',
            isWokenByMessages: true,
          },
        ],
      },
      prompts: {},
    },
  );

  expect(prompt).toBe(
    renderPrompt(
      'task',
      {
        persona: '',
        owner: { name: 'Robin' },
        task: { name: 'Tide tables', brief: 'Find the high tides for Saturday.' },
      },
      {},
    ),
  );
});

test('it names a task missing from the directory by its ID, with an empty brief', () => {
  const prompt = renderSessionPrompt(
    { kind: 'task', startedBy: 'conversation', report: 'wake' },
    {
      taskID: 'k3vq8m2xpa',
      persona: '',
      skillCatalog: null,
      ownerName: null,
      messaging: { directory: [] },
      prompts: {},
    },
  );

  expect(prompt).toStartWith('You are "k3vq8m2xpa", one of the tasks');
});
