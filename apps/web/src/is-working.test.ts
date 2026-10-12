import { expect, test } from 'bun:test';
import { isWorking } from './is-working';
import { buildMockLogRecord } from './test-utils/build-mock-log-record';
import { buildMockStepActivity } from './test-utils/build-mock-step-activity';

test('it is working while a sent message waits to show', () => {
  expect(isWorking([], true)).toBe(true);
});

test('it is working while your message is the last thing in the conversation', () => {
  const question = buildMockLogRecord({ kind: 'owner_message', message: { text: '?' } });

  expect(isWorking([{ kind: 'message', record: question }], false)).toBe(true);
});

test('it is not working once a reply follows your message', () => {
  const question = buildMockLogRecord({ kind: 'owner_message', message: { text: '?' } });
  const reply = buildMockLogRecord({ kind: 'assistant_message', message: { text: '!' } });

  expect(
    isWorking(
      [
        { kind: 'message', record: question },
        { kind: 'message', record: reply },
      ],
      false,
    ),
  ).toBe(false);
});

test('it is working while a step that finished follows your unanswered message', () => {
  const question = buildMockLogRecord({ kind: 'owner_message', message: { text: '?' } });

  expect(
    isWorking(
      [{ kind: 'message', record: question }, buildMockStepActivity({ status: 'done' })],
      false,
    ),
  ).toBe(true);
});

test.each(['failed', 'interrupted'] as const)(
  'it is not working once a step after your message is %s',
  (status) => {
    const question = buildMockLogRecord({ kind: 'owner_message', message: { text: '?' } });

    expect(
      isWorking([{ kind: 'message', record: question }, buildMockStepActivity({ status })], false),
    ).toBe(false);
  },
);

test('it is working while a step runs, even after a reply', () => {
  const reply = buildMockLogRecord({ kind: 'model.reply', message: { text: '!' } });

  expect(
    isWorking(
      [buildMockStepActivity({ status: 'running' }), { kind: 'message', record: reply }],
      false,
    ),
  ).toBe(true);
});

test.each(['done', 'failed', 'interrupted'] as const)(
  'it is not working once the last step is %s',
  (status) => {
    expect(isWorking([buildMockStepActivity({ status })], false)).toBe(false);
  },
);

test('it is not working in an empty conversation with nothing to send', () => {
  expect(isWorking([], false)).toBe(false);
});
