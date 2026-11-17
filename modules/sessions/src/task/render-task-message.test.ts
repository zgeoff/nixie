import { expect, test } from 'bun:test';
import { buildMockLogRecord } from '@heynixie/log/test-utils';
import { buildMockTaskMessageView } from '../test-utils/build-mock-task-message-view';
import { renderTaskMessage } from './render-task-message';

test('it renders a task message in the envelope, with the attributes in order and a fence that closes it', () => {
  const record = buildMockLogRecord({
    kind: 'task_message',
    thread: 'conversation',
    recordedAt: new Date('2026-10-13T03:05:00Z'),
    payload: {
      messageID: 'p3x9',
      from: 'conversation',
      to: 'conversation',
      kind: 'reply',
      replyTo: 'm7k2',
      onBehalfOf: ['16035', '16036'],
      hop: 1,
      hopLimit: 20,
      wake: true,
      woke: true,
      source: 'task:conversation',
    },
    erasable: { status: 'readable', fields: { body: 'The one on Mill Lane opens at 6.' } },
  });

  const rendered = renderTaskMessage(
    record,
    { defaultZone: 'UTC', now: new Date('2026-10-13T03:05:00Z') },
    buildMockTaskMessageView(),
  );

  const fence = /fence="(?<fence>[\da-f]{12})"/u.exec(rendered)?.groups?.['fence'];

  expect(rendered).toBe(
    [
      `<task-message id="p3x9" from="nixie, in the chat with the owner" kind="reply" reply-to="m7k2" sent="Tue 13 Oct, 03:05, UTC" on-behalf-of="16035 16036" fence="${fence}">`,
      'The one on Mill Lane opens at 6.',
      `</task-message fence="${fence}">`,
    ].join('\n'),
  );
});

test('it leaves out reply-to and on-behalf-of for a message that is no reply and passes nothing on', () => {
  const record = buildMockLogRecord({
    kind: 'task_message',
    thread: 'conversation',
    recordedAt: new Date('2026-10-13T03:05:00Z'),
    payload: {
      messageID: 'k3vq8m2xpa',
      from: 'conversation',
      to: 'conversation',
      kind: 'chat',
      replyTo: null,
      onBehalfOf: [],
      hop: 1,
      hopLimit: 20,
      wake: true,
      woke: true,
      source: 'task:conversation',
    },
    erasable: { status: 'readable', fields: { body: 'Done.' } },
  });

  const rendered = renderTaskMessage(
    record,
    { defaultZone: 'UTC', now: new Date('2026-10-13T03:05:00Z') },
    buildMockTaskMessageView(),
  );

  expect(rendered).toStartWith(
    '<task-message id="k3vq8m2xpa" from="nixie, in the chat with the owner" kind="chat" sent="Tue 13 Oct, 03:05, UTC" fence="',
  );

  expect(rendered).not.toMatch(
    /reply-to|on-behalf-of|name=|age=|hop=|reply-wakes|from another task/u,
  );
});

test.each([
  ['persona_task', 'Pip (task: Plans & "trips")'],
  ['plain_task', 'task: Plans & "trips"'],
] as const)(
  'it labels a sender with the speaker %s as %s, and escapes the label in its attribute',
  (speaker, label) => {
    const record = buildMockLogRecord({
      kind: 'task_message',
      thread: 'conversation',
      recordedAt: new Date('2026-10-13T03:05:00Z'),
      payload: {
        messageID: 'k3vq8m2xpa',
        from: 'planner',
        to: 'conversation',
        kind: 'progress',
        replyTo: null,
        onBehalfOf: [],
        hop: 1,
        hopLimit: 20,
        wake: true,
        woke: true,
        source: 'task:planner',
      },
      erasable: { status: 'readable', fields: { body: 'Halfway.' } },
    });

    const rendered = renderTaskMessage(
      record,
      { defaultZone: 'UTC', now: new Date('2026-10-13T03:05:00Z') },
      buildMockTaskMessageView({
        messaging: {
          directory: [
            {
              taskID: 'planner',
              name: 'Plans & "trips"',
              brief: 'Plans trips.',
              wakeable: true,
              speaker,
            },
          ],
          unlisted: [],
          hopLimit: 20,
          ownerName: null,
          agentName: 'Pip',
        },
      }),
    );

    expect(rendered).toInclude(
      ` from="${label.replaceAll('&', '&amp;').replaceAll('"', '&quot;')}" `,
    );
  },
);

test('it labels a sender that the directory lists no more with its task ID', () => {
  const record = buildMockLogRecord({
    kind: 'task_message',
    thread: 'conversation',
    recordedAt: new Date('2026-10-13T03:05:00Z'),
    payload: {
      messageID: 'k3vq8m2xpa',
      from: 't4m2',
      to: 'conversation',
      kind: 'progress',
      replyTo: null,
      onBehalfOf: [],
      hop: 1,
      hopLimit: 20,
      wake: true,
      woke: true,
      source: 'task:t4m2',
    },
    erasable: { status: 'readable', fields: { body: 'Halfway.' } },
  });

  expect(
    renderTaskMessage(
      record,
      { defaultZone: 'UTC', now: new Date('2026-10-13T03:05:00Z') },
      buildMockTaskMessageView(),
    ),
  ).toInclude(' from="task: t4m2" ');
});

test.each([
  {
    title: 'a report from a plain task as the name and the task ID',
    kind: 'report',
    directory: [
      {
        taskID: 'planner',
        brief: 'Plans trips.',
        wakeable: true,
        name: 'Plans',
        speaker: 'plain_task' as const,
      },
    ],
    unlisted: [],
    label: 'task: Plans (planner)',
  },
  {
    title: 'a report from a persona task as the name and the task ID in the task label',
    kind: 'report',
    directory: [
      {
        taskID: 'planner',
        brief: 'Plans trips.',
        wakeable: true,
        name: 'Plans',
        speaker: 'persona_task' as const,
      },
    ],
    unlisted: [],
    label: 'Pip (task: Plans (planner))',
  },
  {
    title: 'a report from a sender with no profile as the task ID alone',
    kind: 'report',
    directory: [],
    unlisted: [],
    label: 'task: planner',
  },
  {
    title: 'a report from a persona task named by its task ID as the task ID alone',
    kind: 'report',
    directory: [
      {
        taskID: 'planner',
        brief: 'Plans trips.',
        wakeable: true,
        name: 'planner',
        speaker: 'persona_task' as const,
      },
    ],
    unlisted: [],
    label: 'Pip (task: planner)',
  },
  {
    title: 'a report from a plain task with an empty name as the task ID alone',
    kind: 'report',
    directory: [
      {
        taskID: 'planner',
        brief: 'Plans trips.',
        wakeable: true,
        name: '',
        speaker: 'plain_task' as const,
      },
    ],
    unlisted: [],
    label: 'task: planner',
  },
  {
    title:
      'a report from a sender that only the unlisted profiles hold as the name and the task ID',
    kind: 'report',
    directory: [],
    unlisted: [
      {
        taskID: 'planner',
        brief: 'Plans trips.',
        wakeable: true,
        name: 'Plans',
        speaker: 'plain_task' as const,
      },
    ],
    label: 'task: Plans (planner)',
  },
  {
    title: 'a report from a task whose name holds a slot with the slot kept as text',
    kind: 'report',
    directory: [
      {
        taskID: 'planner',
        brief: 'Plans trips.',
        wakeable: true,
        name: 'Plans {id}',
        speaker: 'plain_task' as const,
      },
    ],
    unlisted: [],
    label: 'task: Plans {id} (planner)',
  },
  {
    title: 'a question from a sender that only the unlisted profiles hold as the name alone',
    kind: 'question',
    directory: [],
    unlisted: [
      {
        taskID: 'planner',
        brief: 'Plans trips.',
        wakeable: true,
        name: 'Plans',
        speaker: 'plain_task' as const,
      },
    ],
    label: 'task: Plans',
  },
  {
    title: 'a question from a plain task as the name alone',
    kind: 'question',
    directory: [
      {
        taskID: 'planner',
        brief: 'Plans trips.',
        wakeable: true,
        name: 'Plans',
        speaker: 'plain_task' as const,
      },
    ],
    unlisted: [],
    label: 'task: Plans',
  },
])('it labels $title', (row) => {
  const record = buildMockLogRecord({
    kind: 'task_message',
    thread: 'conversation',
    recordedAt: new Date('2026-10-13T03:05:00Z'),
    payload: {
      messageID: 'k3vq8m2xpa',
      from: 'planner',
      to: 'conversation',
      kind: row.kind,
      replyTo: null,
      onBehalfOf: [],
      hop: 1,
      hopLimit: 20,
      wake: true,
      woke: true,
      source: 'task:planner',
    },
    erasable: { status: 'readable', fields: { body: 'Done.' } },
  });

  const rendered = renderTaskMessage(
    record,
    { defaultZone: 'UTC', now: new Date('2026-10-13T03:05:00Z') },
    buildMockTaskMessageView({
      messaging: {
        directory: row.directory,
        unlisted: row.unlisted,
        hopLimit: 20,
        ownerName: null,
        agentName: 'Pip',
      },
    }),
  );

  expect(rendered).toInclude(` from="${row.label}" `);
});

test("it renders a forgotten message's body as forgotten", () => {
  const record = buildMockLogRecord({
    kind: 'task_message',
    thread: 'conversation',
    recordedAt: new Date('2026-10-13T03:05:00Z'),
    payload: {
      messageID: 'k3vq8m2xpa',
      from: 'conversation',
      to: 'conversation',
      kind: 'chat',
      replyTo: null,
      onBehalfOf: [],
      hop: 1,
      hopLimit: 20,
      wake: true,
      woke: true,
      source: 'task:conversation',
    },
    erasable: { status: 'unreadable' },
  });

  expect(
    renderTaskMessage(
      record,
      { defaultZone: 'UTC', now: new Date('2026-10-13T03:05:00Z') },
      buildMockTaskMessageView(),
    ),
  ).toInclude('>\n[a message since forgotten]\n</task-message fence="');
});
