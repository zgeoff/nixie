import { expect, test } from 'bun:test';
import { renderPrompt } from '@heynixie/prompts';
import { renderSessionPrompt } from './render-session-prompt';

function setupTest() {
  return {
    emptyMessaging: { directory: [], unlisted: [], ownerName: null, agentName: null },
    messagingOfThree: {
      unlisted: [],
      directory: [
        {
          taskID: 'conversation',
          name: 'Conversation',
          brief: 'Talks with the owner.',
          wakeable: true,
          speaker: 'conversation' as const,
        },
        {
          taskID: 'k3vq8m2xpa',
          name: 'Tide tables',
          brief: 'Find the high tides.',
          wakeable: true,
          speaker: 'plain_task' as const,
        },
        {
          taskID: 'w2n8d5hc4r',
          name: 'Moon phases',
          brief: 'List the phases.',
          wakeable: true,
          speaker: 'plain_task' as const,
        },
      ],
      ownerName: 'Robin',
      agentName: 'Aria',
    },
  };
}

test('it renders the session prompt with the persona and the skill catalog for the conversation', () => {
  const ctx = setupTest();

  const prompt = renderSessionPrompt(
    { kind: 'conversation' },
    {
      taskID: 'conversation',
      persona: 'You are nixie.',
      skillCatalog: 'Skills: tide-tables.',
      ownerName: 'Robin',
      messaging: ctx.emptyMessaging,
      prompts: {},
      report: null,
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
  const ctx = setupTest();

  const prompt = renderSessionPrompt(
    { kind: 'task', startedBy: 'conversation', report: 'wake' },
    {
      taskID: 'k3vq8m2xpa',
      persona: '',
      skillCatalog: null,
      ownerName: 'Robin',
      messaging: {
        ...ctx.emptyMessaging,
        directory: [
          {
            taskID: 'k3vq8m2xpa',
            name: 'Tide tables',
            brief: 'Find the high tides for Saturday.',
            wakeable: true,
            speaker: 'plain_task',
          },
        ],
      },
      prompts: {},
      report: null,
    },
  );

  expect(prompt).toBe(
    renderPrompt(
      'task',
      {
        persona: '',
        skillCatalog: null,
        owner: { name: 'Robin' },
        task: {
          name: 'Tide tables',
          brief: 'Find the high tides for Saturday.',
          reportTargetSentence: '',
        },
      },
      {},
    ),
  );
});

test('it names a task missing from the directory by its ID, with an empty brief', () => {
  const ctx = setupTest();

  const prompt = renderSessionPrompt(
    { kind: 'task', startedBy: 'conversation', report: 'wake' },
    {
      taskID: 'k3vq8m2xpa',
      persona: '',
      skillCatalog: null,
      ownerName: null,
      messaging: ctx.emptyMessaging,
      prompts: {},
      report: null,
    },
  );

  expect(prompt).toStartWith('You are "k3vq8m2xpa", a task working for the owner.');
});

test.each([
  [
    'a definition task run that reports to the conversation',
    { mode: 'wake', target: 'conversation' },
    ' Your report goes to Aria, in the chat with Robin.',
  ],
  [
    'a started task that reports to its starter',
    { mode: 'next_turn', target: 'w2n8d5hc4r' },
    ' Your report goes to task: Moon phases.',
  ],
  ['a task run under the report mode none', { mode: 'none', target: 'conversation' }, ''],
  ['a task run with no target', { mode: 'wake', target: null }, ''],
] as const)('it fills the report target sentence for %s', (_label, report, sentence) => {
  const ctx = setupTest();

  const prompt = renderSessionPrompt(
    { kind: 'task', startedBy: 'conversation', report: 'wake' },
    {
      taskID: 'k3vq8m2xpa',
      persona: '',
      skillCatalog: null,
      ownerName: 'Robin',
      messaging: ctx.messagingOfThree,
      prompts: {},
      report,
    },
  );

  expect(prompt).toInclude(`with a short summary.${sentence} Calling it ends the task.`);
});

test('it fills no report target sentence for a step with no open task run', () => {
  const ctx = setupTest();

  const prompt = renderSessionPrompt(
    { kind: 'task', startedBy: 'conversation', report: 'wake' },
    {
      taskID: 'k3vq8m2xpa',
      persona: '',
      skillCatalog: null,
      ownerName: 'Robin',
      messaging: ctx.messagingOfThree,
      prompts: {},
      report: null,
    },
  );

  expect(prompt).toInclude('with a short summary. Calling it ends the task.');
});
