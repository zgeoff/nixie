import { expect, test } from 'bun:test';
import { planTaskMessage } from './plan-task-message';

test('it sends a question one hop past its step, wakes a receiver that wakes for messages, and opens a wait', () => {
  expect(
    planTaskMessage(
      {
        from: 'planner',
        to: 'conversation',
        kind: 'question',
        body: 'Which day suits the dentist?',
        replyTo: null,
        onBehalfOf: ['#4821'],
        wake: true,
      },
      {
        senderHop: 2,
        receiverState: 'waiting',
        isReplyToKnown: false,
        ownerMessageIDs: new Set(['4821']),
      },
      {
        directory: [
          {
            taskID: 'conversation',
            name: 'Conversation',
            brief: 'Talks.',
            isWokenByMessages: true,
          },
        ],
        hopLimit: 20,
      },
    ),
  ).toStrictEqual({
    status: 'send',
    hop: 3,
    woke: true,
    hold: 'none',
    opensWait: true,
    onBehalfOf: ['4821'],
  });
});

test('it holds a message one hop past the limit, and wakes nobody', () => {
  expect(
    planTaskMessage(
      {
        from: 'planner',
        to: 'conversation',
        kind: 'chat',
        body: 'Still there?',
        replyTo: null,
        onBehalfOf: [],
        wake: true,
      },
      {
        senderHop: 3,
        receiverState: 'waiting',
        isReplyToKnown: false,
        ownerMessageIDs: new Set(),
      },
      {
        directory: [
          {
            taskID: 'conversation',
            name: 'Conversation',
            brief: 'Talks.',
            isWokenByMessages: true,
          },
        ],
        hopLimit: 3,
      },
    ),
  ).toStrictEqual({
    status: 'send',
    hop: 4,
    woke: false,
    hold: 'hop_limit',
    opensWait: false,
    onBehalfOf: [],
  });
});

test('it sends a message that reaches the limit exactly, and wakes the receiver', () => {
  expect(
    planTaskMessage(
      {
        from: 'planner',
        to: 'conversation',
        kind: 'chat',
        body: 'Still there?',
        replyTo: null,
        onBehalfOf: [],
        wake: true,
      },
      {
        senderHop: 2,
        receiverState: 'waiting',
        isReplyToKnown: false,
        ownerMessageIDs: new Set(),
      },
      {
        directory: [
          {
            taskID: 'conversation',
            name: 'Conversation',
            brief: 'Talks.',
            isWokenByMessages: true,
          },
        ],
        hopLimit: 3,
      },
    ),
  ).toStrictEqual({
    status: 'send',
    hop: 3,
    woke: true,
    hold: 'none',
    opensWait: false,
    onBehalfOf: [],
  });
});

test('it holds a request for a scheduled receiver until its next run, and opens no wait', () => {
  expect(
    planTaskMessage(
      {
        from: 'conversation',
        to: 'memory-writer',
        kind: 'request',
        body: 'Skip the note about the bike.',
        replyTo: null,
        onBehalfOf: [],
        wake: true,
      },
      {
        senderHop: 0,
        receiverState: 'waiting',
        isReplyToKnown: false,
        ownerMessageIDs: new Set(),
      },
      {
        directory: [
          {
            taskID: 'memory-writer',
            name: 'Memory writer',
            brief: 'Saves.',
            isWokenByMessages: false,
          },
        ],
        hopLimit: 20,
      },
    ),
  ).toStrictEqual({
    status: 'send',
    hop: 1,
    woke: false,
    hold: 'next_run',
    opensWait: false,
    onBehalfOf: [],
  });
});

test('it sends a message with no wake as no hold, and wakes nobody', () => {
  expect(
    planTaskMessage(
      {
        from: 'planner',
        to: 'conversation',
        kind: 'progress',
        body: 'Halfway.',
        replyTo: null,
        onBehalfOf: [],
        wake: false,
      },
      {
        senderHop: 0,
        receiverState: 'waiting',
        isReplyToKnown: false,
        ownerMessageIDs: new Set(),
      },
      {
        directory: [
          {
            taskID: 'conversation',
            name: 'Conversation',
            brief: 'Talks.',
            isWokenByMessages: true,
          },
        ],
        hopLimit: 20,
      },
    ),
  ).toStrictEqual({
    status: 'send',
    hop: 1,
    woke: false,
    hold: 'none',
    opensWait: false,
    onBehalfOf: [],
  });
});

test('it opens no wait for a question to a scheduled receiver sent with no wake', () => {
  expect(
    planTaskMessage(
      {
        from: 'conversation',
        to: 'memory-writer',
        kind: 'question',
        body: 'Did you save the note about the bike?',
        replyTo: null,
        onBehalfOf: [],
        wake: false,
      },
      {
        senderHop: 0,
        receiverState: 'waiting',
        isReplyToKnown: false,
        ownerMessageIDs: new Set(),
      },
      {
        directory: [
          {
            taskID: 'memory-writer',
            name: 'Memory writer',
            brief: 'Saves.',
            isWokenByMessages: false,
          },
        ],
        hopLimit: 20,
      },
    ),
  ).toStrictEqual({
    status: 'send',
    hop: 1,
    woke: false,
    hold: 'none',
    opensWait: false,
    onBehalfOf: [],
  });
});

test.each([
  {
    label: 'an empty body',
    body: '  ',
    to: 'conversation',
    receiverState: 'waiting',
    replyTo: null,
    onBehalfOf: [],
    refusal: { reason: 'empty_body' },
  },
  {
    label: 'a message to itself',
    body: 'Hi.',
    to: 'planner',
    receiverState: 'running',
    replyTo: null,
    onBehalfOf: [],
    refusal: { reason: 'self' },
  },
  {
    label: 'a task outside the directory',
    body: 'Hi.',
    to: 'gardener',
    receiverState: 'waiting',
    replyTo: null,
    onBehalfOf: [],
    refusal: { reason: 'unknown_task', taskID: 'gardener' },
  },
  {
    label: 'a listed task with no row',
    body: 'Hi.',
    to: 'conversation',
    receiverState: null,
    replyTo: null,
    onBehalfOf: [],
    refusal: { reason: 'unknown_task', taskID: 'conversation' },
  },
  {
    label: 'a task that is done',
    body: 'Hi.',
    to: 'conversation',
    receiverState: 'done',
    replyTo: null,
    onBehalfOf: [],
    refusal: { reason: 'finished', taskID: 'conversation' },
  },
  {
    label: 'a task that failed',
    body: 'Hi.',
    to: 'conversation',
    receiverState: 'failed',
    replyTo: null,
    onBehalfOf: [],
    refusal: { reason: 'finished', taskID: 'conversation' },
  },
  {
    label: 'a reply to an unknown message',
    body: 'Hi.',
    to: 'conversation',
    receiverState: 'waiting',
    replyTo: 'w7tn4c9rhz',
    onBehalfOf: [],
    refusal: { reason: 'unknown_reply', messageID: 'w7tn4c9rhz' },
  },
  {
    label: 'an on-behalf-of ID that is not an owner message',
    body: 'Hi.',
    to: 'conversation',
    receiverState: 'waiting',
    replyTo: null,
    onBehalfOf: ['#4821', '#9907'],
    refusal: { reason: 'not_owner_message', eventIDs: ['9907'] },
  },
] as const)('it refuses $label', (row) => {
  expect(
    planTaskMessage(
      {
        from: 'planner',
        to: row.to,
        kind: 'chat',
        body: row.body,
        replyTo: row.replyTo,
        onBehalfOf: row.onBehalfOf,
        wake: true,
      },
      {
        senderHop: 0,
        receiverState: row.receiverState,
        isReplyToKnown: false,
        ownerMessageIDs: new Set(['4821']),
      },
      {
        directory: [
          { taskID: 'planner', name: 'Planner', brief: 'Plans.', isWokenByMessages: true },
          {
            taskID: 'conversation',
            name: 'Conversation',
            brief: 'Talks.',
            isWokenByMessages: true,
          },
        ],
        hopLimit: 20,
      },
    ),
  ).toStrictEqual({ status: 'refused', refusal: row.refusal });
});
