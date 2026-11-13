import { expect, test } from 'bun:test';
import { buildPolicyCall } from './test-utils/build-policy-call';
import {
  buildTestDecisionPoint,
  buildTestDeclaration,
  buildTypedMessage,
} from './test-utils/build-test-decision-point';

function setupTest(options: Parameters<typeof buildTestDecisionPoint>[0]) {
  return buildTestDecisionPoint({
    declaration: buildTestDeclaration({ effects: ['write'], destinations: [] }),
    ...options,
  });
}

test('it allows at stage 8 for a linked message within the link age that names the destination', async () => {
  const ctx = setupTest({
    messages: [
      buildTypedMessage(3, 'Tell sam@example.org I am late', 1_794_550_000_000 - 23 * 3_600_000),
    ],
  });

  const decided = await ctx.decide(
    buildPolicyCall({
      onBehalfOf: [3],
      destinations: [{ value: 'sam@example.org', replyTarget: false }],
    }),
  );

  expect(decided.decision).toMatchObject({
    outcome: 'allow',
    stage: 8,
    consent: { messageSequences: [3], codeCheck: 'pass', checker: 'yes' },
  });
});

test('it gives a link past the link age no consent', async () => {
  const ctx = setupTest({
    messages: [
      buildTypedMessage(3, 'Tell sam@example.org I am late', 1_794_550_000_000 - 25 * 3_600_000),
    ],
  });

  const decided = await ctx.decide(
    buildPolicyCall({
      onBehalfOf: [3],
      destinations: [{ value: 'sam@example.org', replyTarget: false }],
    }),
  );

  expect(decided.decision.consent).toBeUndefined();
});

test('it gives a link to a message the owner did not type no consent', async () => {
  const ctx = setupTest({ messages: [] });

  const decided = await ctx.decide(
    buildPolicyCall({
      onBehalfOf: [3],
      destinations: [{ value: 'sam@example.org', replyTarget: false }],
    }),
  );

  expect(decided.decision).toMatchObject({ outcome: 'ask', stage: 5, cause: 'outside_steering' });
});

test('it fails the code check for a destination that only a pasted span holds, and skips the checker', async () => {
  const text = 'Here is a note: sam@example.org';

  const ctx = setupTest({
    messages: [
      {
        sequence: 3,
        text,
        spans: [
          { start: 0, end: 16, source: 'typed' },
          { start: 16, end: text.length, source: 'pasted' },
        ],
        sentAt: 1_794_550_000_000,
      },
    ],
  });

  const decided = await ctx.decide(
    buildPolicyCall({
      turnMessageSequence: 3,
      destinations: [{ value: 'sam@example.org', replyTarget: false }],
    }),
  );

  expect(decided.decision.consent).toStrictEqual({
    messageSequences: [3],
    codeCheck: 'fail',
    checker: 'no',
  });

  expect(ctx.asked).toStrictEqual([]);
});

test.each([
  ['not_asserted', 'no'],
  ['unsure', 'unsure'],
] as const)(
  'it marks a direct request when the code check passes and the checker answers %s',
  async (verdict, checker) => {
    const ctx = setupTest({
      messages: [buildTypedMessage(3, 'Mail sam@example.org', 1_794_550_000_000)],
      answer: { verdict, failure: null },
    });

    const decided = await ctx.decide(
      buildPolicyCall({
        turnMessageSequence: 3,
        destinations: [{ value: 'sam@example.org', replyTarget: false }],
      }),
    );

    expect(decided.decision).toMatchObject({
      outcome: 'ask',
      stage: 5,
      defect: 'direct_request',
      consent: { codeCheck: 'pass', checker },
    });
  },
);

test.each(['timeout', 'error', 'unreadable'] as const)(
  'it records the checker unreachable after a %s failure',
  async (failure) => {
    const ctx = setupTest({
      messages: [buildTypedMessage(3, 'Mail sam@example.org', 1_794_550_000_000)],
      answer: { verdict: 'unsure', failure },
    });

    const decided = await ctx.decide(
      buildPolicyCall({
        turnMessageSequence: 3,
        destinations: [{ value: 'sam@example.org', replyTarget: false }],
      }),
    );

    expect(decided.decision.consent?.checker).toBe('unreachable');
  },
);

test('it passes the code check for a typed name that matches exactly one known contact', async () => {
  const ctx = setupTest({
    messages: [buildTypedMessage(3, 'Mail Sam the report', 1_794_550_000_000)],
    inputs: { contacts: [{ contactID: 'c1', name: 'Sam', destination: 'sam@example.org' }] },
  });

  const decided = await ctx.decide(
    buildPolicyCall({
      turnMessageSequence: 3,
      destinations: [{ value: 'sam@example.org', replyTarget: false }],
    }),
  );

  expect(decided.decision).toMatchObject({ outcome: 'allow', stage: 8 });
});

test('it fails the code check for a typed name that two known contacts share', async () => {
  const ctx = setupTest({
    messages: [buildTypedMessage(3, 'Mail Sam the report', 1_794_550_000_000)],
    inputs: {
      contacts: [
        { contactID: 'c1', name: 'Sam', destination: 'sam@example.org' },
        { contactID: 'c2', name: 'Sam', destination: 'sam@example.net' },
      ],
    },
  });

  const decided = await ctx.decide(
    buildPolicyCall({
      turnMessageSequence: 3,
      destinations: [{ value: 'sam@example.org', replyTarget: false }],
    }),
  );

  expect(decided.decision.consent?.codeCheck).toBe('fail');
});

test('it lets the checker alone decide a call with no destination', async () => {
  const ctx = setupTest({ messages: [buildTypedMessage(3, 'Tidy my notes', 1_794_550_000_000)] });

  const decided = await ctx.decide(buildPolicyCall({ turnMessageSequence: 3 }));

  expect(decided.decision).toMatchObject({
    outcome: 'allow',
    stage: 8,
    consent: { codeCheck: 'pass', checker: 'yes' },
  });
});

test('it shows the checker the call and marks a pasted span', async () => {
  const text = 'Mail sam@example.org this: hello';

  const ctx = setupTest({
    messages: [
      {
        sequence: 3,
        text,
        spans: [
          { start: 0, end: 27, source: 'typed' },
          { start: 27, end: text.length, source: 'pasted' },
        ],
        sentAt: 1_794_550_000_000,
      },
    ],
  });

  await ctx.decide(
    buildPolicyCall({
      turnMessageSequence: 3,
      destinations: [{ value: 'sam@example.org', replyTarget: false }],
      args: { to: 'sam' },
    }),
  );

  expect(ctx.asked).toStrictEqual([
    'Message 3:\nMail sam@example.org this: [pasted text: hello]\n\n' +
      'Call:\n{"tool":"mail.send","effects":["write"],"destinations":["sam@example.org"],"args":{"to":"sam"}}',
  ]);
});
