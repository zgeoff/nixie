import { expect, test } from 'bun:test';
import { isFileOnlyVersion } from './is-file-only-version';

function setupTest() {
  const defaultForm = {
    name: 'Water the tomatoes',
    brief: 'Water the tomatoes.',
    context: 'fresh',
    wakeable: false,
    step: null,
    destinations: [],
    maxCalls: {},
  };

  return { defaultForm };
}

test('#isFileOnlyVersion accepts a form with every file-only key at its default', () => {
  const ctx = setupTest();

  const version = {
    form: ctx.defaultForm,
    files: { 'tasks/water-the-tomatoes/task.yaml': 'name: Water the tomatoes\n' },
  };

  expect(isFileOnlyVersion(version)).toBe(false);
});

test.each([
  ['context', { context: 'continuing' }],
  ['wakeable', { wakeable: true }],
  ['maxCalls', { maxCalls: { 'web.fetch': 2 } }],
  ['destinations', { destinations: ['mail:*'] }],
  ['step', { step: { file: 'step.ts', api: 1 } }],
  ['reportShape', { reportShape: { type: 'object' } }],
  ['skills', { skills: ['tide-tables'] }],
  ['log', { log: 'conversation' }],
])('#isFileOnlyVersion refuses a form that sets %s', (_key, overrides) => {
  const ctx = setupTest();

  expect(isFileOnlyVersion({ form: { ...ctx.defaultForm, ...overrides }, files: {} })).toBe(true);
});

test.each(['tasks/water-the-tomatoes/instructions.md', 'tasks/water-the-tomatoes/step.ts'])(
  '#isFileOnlyVersion refuses a version that holds the file %s',
  (path) => {
    const ctx = setupTest();

    expect(isFileOnlyVersion({ form: ctx.defaultForm, files: { [path]: 'text' } })).toBe(true);
  },
);
