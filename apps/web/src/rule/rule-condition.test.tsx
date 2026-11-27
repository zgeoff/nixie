import { expect, test } from 'bun:test';
import { renderToString } from 'react-dom/server';
import { RuleCondition } from './rule-condition';

function setupTest() {
  return {
    render: (noteBy: 'you' | 'nixie') =>
      renderToString(
        <RuleCondition
          condition={{
            note: 'School mail can go out in the working day.',
            noteBy,
            words: '`args.count` is less than 17',
            source: 'now.getHours("Europe/London") < 17',
          }}
        />,
      ).replaceAll('<!-- -->', ''),
  };
}

test('it labels a note of yours as your note', () => {
  const ctx = setupTest();

  expect(ctx.render('you')).toContain('<strong>Your note:</strong> School mail can go out');
});

test("it labels a note that nixie wrote as nixie's note", () => {
  const ctx = setupTest();

  expect(ctx.render('nixie')).toContain('<strong>nixie&#x27;s note:</strong>');
});

test('it shows the condition in words and the expression behind a control', () => {
  const ctx = setupTest();
  const markup = ctx.render('you');

  expect(markup).toContain('<code class="');
  expect(markup).toContain('args.count</code><span> is less than 17</span>');
  expect(markup).toContain('<summary>Show the expression</summary>');
  expect(markup.indexOf('Show the expression')).toBeLessThan(markup.indexOf('now.getHours'));
});
