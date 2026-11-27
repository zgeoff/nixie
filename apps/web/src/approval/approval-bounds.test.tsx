import { expect, test } from 'bun:test';
import { renderToString } from 'react-dom/server';
import { ApprovalBounds } from './approval-bounds';

function setupTest() {
  return {
    render: (body: Parameters<typeof ApprovalBounds>[0]['body']) =>
      renderToString(<ApprovalBounds body={body} />).replaceAll('<!-- -->', ''),
  };
}

test('it shows the condition under its own rule when only the second rule has one', () => {
  const ctx = setupTest();

  const markup = ctx.render({
    sentence: 'Allow reads. Allow sends.',
    fields: { title: 'Mail', 'rule 1': 'Allow reads.', 'rule 2': 'Allow sends.' },
    ruleSentence: null,
    approveLabel: 'Start the mandate',
    ruleConditions: [
      {
        rule: 1,
        note: 'Only in the working day.',
        noteBy: 'you',
        words: 'the hour in Europe/London is before 17',
        source: 'now.getHours("Europe/London") < 17',
      },
    ],
  });

  const second = markup.indexOf('Allow sends.');
  const condition = markup.indexOf('Only in the working day.');

  expect(markup.indexOf('Allow reads.')).toBeLessThan(second);
  expect(second).toBeLessThan(condition);
  expect(markup.match(/data-testid="rule-condition"/gu)).toHaveLength(1);
});

test('it shows a condition of a rule that has no field of its own after the fields', () => {
  const ctx = setupTest();

  const markup = ctx.render({
    sentence: 'Allow sends.',
    fields: {},
    ruleSentence: 'Allow sends.',
    approveLabel: 'Approve',
    ruleConditions: [
      {
        rule: 0,
        note: 'Work mail only.',
        noteBy: 'you',
        words: 'the account is work',
        source: 'args.account == "work"',
      },
    ],
  });

  expect(markup.indexOf('Always allow adds this rule')).toBeLessThan(
    markup.indexOf('Work mail only.'),
  );
});

test('it labels the note of an owner mandate as your note', () => {
  const ctx = setupTest();

  const markup = ctx.render({
    sentence: 'Allow sends.',
    fields: { 'rule 1': 'Allow sends.' },
    ruleSentence: null,
    approveLabel: 'Start the mandate',
    ruleConditions: [
      {
        rule: 0,
        note: 'Work mail only.',
        noteBy: 'you',
        words: 'the account is work',
        source: 'args.account == "work"',
      },
    ],
  });

  expect(markup).toContain('<strong>Your note:</strong>');
});
