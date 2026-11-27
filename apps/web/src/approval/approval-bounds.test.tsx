import { expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import { renderToString } from 'react-dom/server';
import { ApprovalBounds } from './approval-bounds';

function setupTest() {
  return {
    render: (body: Parameters<typeof ApprovalBounds>[0]['body']) =>
      renderToString(<ApprovalBounds body={body} />).replaceAll('<!-- -->', ''),
    parse: (markup: string) => {
      const window = new Window();

      window.document.body.innerHTML = markup;

      return window.document;
    },
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

  const [, first, second] = ctx.parse(markup).querySelectorAll('dl > div');

  expect(first?.textContent).toContain('Allow reads.');
  expect(first?.querySelector('[data-testid="rule-condition"]')).toBeNull();
  expect(second?.textContent).toContain('Allow sends.');

  expect(second?.querySelector('[data-testid="rule-condition"]')?.textContent).toContain(
    'Only in the working day.',
  );
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
