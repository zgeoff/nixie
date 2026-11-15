import { expect, test } from 'bun:test';
import { buildApprovalChanges } from './build-approval-changes';

function setupTest() {
  return {
    body: {
      sentence: 'Send a message to harbour@example.org.',
      fields: { subject: 'Tide table' },
      ruleSentence: null,
    },
  };
}

test('it reports no change for the same body', () => {
  const ctx = setupTest();

  expect(
    buildApprovalChanges(ctx.body, { ...ctx.body, fields: { ...ctx.body.fields } }),
  ).toStrictEqual([]);
});

test('it reports a changed sentence as a word diff', () => {
  const ctx = setupTest();

  const changes = buildApprovalChanges(ctx.body, {
    ...ctx.body,
    sentence: 'Send a message to marina@example.org.',
  });

  expect(changes).toStrictEqual([
    {
      label: 'What it does',
      parts: [
        { kind: 'same', text: 'Send a message to ' },
        { kind: 'removed', text: 'harbour@example.org.' },
        { kind: 'added', text: 'marina@example.org.' },
      ],
    },
  ]);
});

test('it reports a changed field, a new field and a removed field by name', () => {
  const ctx = setupTest();

  const changes = buildApprovalChanges(
    { ...ctx.body, fields: { subject: 'Tide table', cc: 'a@example.org' } },
    { ...ctx.body, fields: { subject: 'Tide times', attachment: 'tides.pdf' } },
  );

  expect(changes.map((change) => change.label)).toStrictEqual(['attachment', 'cc', 'subject']);
});

test('it reports a changed rule sentence under the rule', () => {
  const ctx = setupTest();

  const changes = buildApprovalChanges(
    { ...ctx.body, ruleSentence: 'Allow mail.send to harbour@example.org.' },
    { ...ctx.body, ruleSentence: 'Allow mail.send.' },
  );

  expect(changes.map((change) => change.label)).toStrictEqual(['The rule']);
});
