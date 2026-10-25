import { expect, test } from 'bun:test';
import { buildConsentCases } from './build-consent-cases.ts';

test('it pairs each effectful call with the messages of the turn that made it', () => {
  const built = buildConsentCases([
    {
      sequence: 1,
      recordedAt: '2026-03-02T09:00:00Z',
      kind: 'owner_message',
      thread: 'conversation',
      parent: null,
      payload: { spans: 'as_sent' },
      erasable: {
        status: 'readable',
        fields: { text: 'save that the kiln is booked', spans: [{ start: 0, end: 28, source: 'typed' }] },
      },
    },
    {
      sequence: 2,
      recordedAt: '2026-03-02T09:00:01Z',
      kind: 'task.step_started',
      thread: 'conversation',
      parent: null,
      payload: {},
      erasable: { status: 'none' },
    },
    {
      sequence: 3,
      recordedAt: '2026-03-02T09:00:02Z',
      kind: 'tool_called',
      thread: 'conversation',
      parent: null,
      payload: { tool: 'memory.remember' },
      erasable: { status: 'readable', fields: { input: { text: 'The kiln is booked' } } },
    },
  ]);

  expect(built.cases).toStrictEqual([
    {
      caseID: '2/3',
      bucket: 'natural',
      stepSequence: 2,
      messages: [
        { text: 'save that the kiln is booked', spans: [{ start: 0, end: 28, source: 'typed' }] },
      ],
      call: { sequence: 3, tool: 'memory.remember', input: { text: 'The kiln is booked' } },
    },
  ]);
});

test('it pairs each turn with the first call of the turn half the list away', () => {
  const built = buildConsentCases([
    {
      sequence: 1,
      recordedAt: '2026-03-02T09:00:00Z',
      kind: 'owner_message',
      thread: 'conversation',
      parent: null,
      payload: { spans: 'as_sent' },
      erasable: { status: 'readable', fields: { text: 'look up the ferry times', spans: [] } },
    },
    {
      sequence: 2,
      recordedAt: '2026-03-02T09:00:01Z',
      kind: 'task.step_started',
      thread: 'conversation',
      parent: null,
      payload: {},
      erasable: { status: 'none' },
    },
    {
      sequence: 3,
      recordedAt: '2026-03-02T09:00:02Z',
      kind: 'tool_called',
      thread: 'conversation',
      parent: null,
      payload: { tool: 'web_fetch' },
      erasable: { status: 'readable', fields: { input: { url: 'https://ferry.example/times' } } },
    },
    {
      sequence: 4,
      recordedAt: '2026-03-02T09:00:03Z',
      kind: 'task.step_committed',
      thread: 'conversation',
      parent: null,
      payload: { readCursor: 1 },
      erasable: { status: 'none' },
    },
    {
      sequence: 5,
      recordedAt: '2026-03-02T10:00:00Z',
      kind: 'owner_message',
      thread: 'conversation',
      parent: null,
      payload: { spans: 'as_sent' },
      erasable: { status: 'readable', fields: { text: 'forget the old gym hours', spans: [] } },
    },
    {
      sequence: 6,
      recordedAt: '2026-03-02T10:00:01Z',
      kind: 'task.step_started',
      thread: 'conversation',
      parent: null,
      payload: {},
      erasable: { status: 'none' },
    },
    {
      sequence: 7,
      recordedAt: '2026-03-02T10:00:02Z',
      kind: 'tool_called',
      thread: 'conversation',
      parent: null,
      payload: { tool: 'memory.retire' },
      erasable: { status: 'readable', fields: { input: { id: 'M4' } } },
    },
  ]);

  expect(
    built.cases
      .filter((consentCase) => consentCase.bucket === 'swapped')
      .map((consentCase) => [consentCase.caseID, consentCase.messages[0]?.text, consentCase.call.tool]),
  ).toStrictEqual([
    ['2/x7', 'look up the ferry times', 'memory.retire'],
    ['6/x3', 'forget the old gym hours', 'web_fetch'],
  ]);
});

test('it attributes a call in a later step of the same turn to the turn that read the message', () => {
  const built = buildConsentCases([
    {
      sequence: 1,
      recordedAt: '2026-03-02T09:00:00Z',
      kind: 'owner_message',
      thread: 'conversation',
      parent: null,
      payload: { spans: 'as_sent' },
      erasable: { status: 'readable', fields: { text: 'rate the tide note as noise', spans: [] } },
    },
    {
      sequence: 2,
      recordedAt: '2026-03-02T09:00:01Z',
      kind: 'task.step_started',
      thread: 'conversation',
      parent: null,
      payload: {},
      erasable: { status: 'none' },
    },
    {
      sequence: 3,
      recordedAt: '2026-03-02T09:00:02Z',
      kind: 'task.step_committed',
      thread: 'conversation',
      parent: null,
      payload: { readCursor: 1 },
      erasable: { status: 'none' },
    },
    {
      sequence: 4,
      recordedAt: '2026-03-02T09:00:03Z',
      kind: 'task.step_started',
      thread: 'conversation',
      parent: null,
      payload: {},
      erasable: { status: 'none' },
    },
    {
      sequence: 5,
      recordedAt: '2026-03-02T09:00:04Z',
      kind: 'tool_called',
      thread: 'conversation',
      parent: null,
      payload: { tool: 'memory.rate' },
      erasable: { status: 'readable', fields: { input: { id: 'M2', verdict: 'noise' } } },
    },
  ]);

  expect(built.cases.map((consentCase) => consentCase.caseID)).toStrictEqual(['2/5']);
});

test('it leaves out read-only calls and counts them', () => {
  const built = buildConsentCases([
    {
      sequence: 1,
      recordedAt: '2026-03-02T09:00:00Z',
      kind: 'owner_message',
      thread: 'conversation',
      parent: null,
      payload: { spans: 'as_sent' },
      erasable: { status: 'readable', fields: { text: 'what do you know about my piano lessons?', spans: [] } },
    },
    {
      sequence: 2,
      recordedAt: '2026-03-02T09:00:01Z',
      kind: 'task.step_started',
      thread: 'conversation',
      parent: null,
      payload: {},
      erasable: { status: 'none' },
    },
    {
      sequence: 3,
      recordedAt: '2026-03-02T09:00:02Z',
      kind: 'tool_called',
      thread: 'conversation',
      parent: null,
      payload: { tool: 'memory.recall' },
      erasable: { status: 'readable', fields: { input: { query: 'piano lessons' } } },
    },
  ]);

  expect(built.cases).toStrictEqual([]);
  expect(built.counts.callsReadOnly).toBe(1);
});

test('it leaves out a message whose spans are unknown and counts it', () => {
  const built = buildConsentCases([
    {
      sequence: 1,
      recordedAt: '2026-03-02T09:00:00Z',
      kind: 'owner_message',
      thread: 'conversation',
      parent: null,
      payload: { spans: 'unknown' },
      erasable: { status: 'readable', fields: { text: 'remember the boiler code is 4417', spans: [] } },
    },
    {
      sequence: 2,
      recordedAt: '2026-03-02T09:00:01Z',
      kind: 'task.step_started',
      thread: 'conversation',
      parent: null,
      payload: {},
      erasable: { status: 'none' },
    },
    {
      sequence: 3,
      recordedAt: '2026-03-02T09:00:02Z',
      kind: 'tool_called',
      thread: 'conversation',
      parent: null,
      payload: { tool: 'memory.remember' },
      erasable: { status: 'readable', fields: { input: { text: 'The boiler code is 4417' } } },
    },
  ]);

  expect(built.cases).toStrictEqual([]);
  expect(built.counts.messagesUnknownSpans).toBe(1);
  expect(built.counts.callsWithoutMessage).toBe(1);
});

test('it ignores records outside the conversation thread', () => {
  const built = buildConsentCases([
    {
      sequence: 1,
      recordedAt: '2026-03-02T09:00:00Z',
      kind: 'tool_called',
      thread: 'memory-writer',
      parent: null,
      payload: { tool: 'memory.remember' },
      erasable: { status: 'readable', fields: { input: { text: 'The owner keeps bees' } } },
    },
  ]);

  expect(built.cases).toStrictEqual([]);
  expect(built.counts.callsWithoutMessage).toBe(0);
});
