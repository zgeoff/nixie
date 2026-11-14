import { expect, test } from 'bun:test';
import { roleNeeds } from '../role/role-needs';
import { checkHarnessFit } from './check-harness-fit';

test.each([
  ['conversation', 'agent-sdk', { fits: true, missing: [] }],
  ['task', 'codex', { fits: true, missing: [] }],
  ['checker', 'codex', { fits: false, missing: ['structured-output'] }],
  [
    'conversation',
    'codex',
    {
      fits: false,
      missing: ['resume', 'resume-at-entry', 'live-messages', 'summarize', 'context-window'],
    },
  ],
] as const)('it checks the %s role on the %s harness', (role, harness, fit) => {
  expect(checkHarnessFit({ harness }, roleNeeds[role])).toStrictEqual(fit);
});
