import { expect, test } from 'bun:test';
import { formatRefusalReason } from './format-refusal-reason';

test.each([
  ['not_found', 'This proposal is gone, so nothing changed.'],
  ['choice', 'This answer is not offered for this proposal, so nothing changed.'],
  ['no_handler', 'Nixie cannot answer this kind of proposal, so nothing changed.'],
  ['memory', 'A memory edit does not apply to this proposal, so nothing changed.'],
  ['note', 'A note takes 1 to 500 characters, so nothing changed.'],
  ['defer_until', 'Pick a time from 1 minute to 30 days away, so nothing changed.'],
  ['rule_gone', 'The rule this answer needs is gone, so nothing changed.'],
  ['arguments_gone', 'The details of this action were erased, so nothing ran and nothing changed.'],
  ['action_changed', 'The action changed after nixie asked, so nothing ran and nothing changed.'],
  [
    'held_action_gone',
    'The action this question held is gone, so nothing ran and nothing changed.',
  ],
  ['expired', 'This mandate has ended, so nothing changed.'],
  ['withdraw_only', 'This proposal can only be withdrawn, so nothing changed.'],
  ['proposal_detached', 'The MCP server this proposal names is gone, so nothing changed.'],
  ['form_refused', 'The tool no longer has a form you can allow, so nothing changed.'],
  ['memory_not_started', 'Memory is not running yet, so nothing changed.'],
  ['prompt_check', 'The prompt did not pass its check, so nothing changed.'],
  ['skill_check', 'The skill did not pass its check, so nothing changed.'],
  ['not_allowed', 'This answer is not allowed, so nothing changed.'],
  ['not_waiting', 'Nothing waits on this answer, so nothing changed.'],
  ['client_action_id_reused', 'This answer reused the ID of an earlier one, so nothing changed.'],
  ['LABEL_EDIT', 'The label edit is not allowed for this memory, so nothing changed.'],
  ['PIN_EDIT', 'The pin edit is not allowed for this memory, so nothing changed.'],
  ['PINNED_CORE_FULL', 'The pinned core is full, so nothing changed.'],
  ['RETIREMENT_EDIT', 'The retirement edit is not allowed for this memory, so nothing changed.'],
  ['REVISION_TARGET', 'The memory this one revises cannot be revised, so nothing changed.'],
  ['SELF_NOTE_REFUSED', 'Nixie keeps no note about this, so nothing changed.'],
  ['TEXT_TOO_LONG', 'The memory text is too long, so nothing changed.'],
  ['WRONG_STATE', 'This memory is not in a state that takes this answer, so nothing changed.'],
  ['a_newer_reason', 'The host refused this answer, so nothing changed.'],
])('it words the refusal reason %s in plain text', (reason, sentence) => {
  expect(formatRefusalReason(reason)).toBe(sentence);
});
