import { expect, test } from 'bun:test';
import { buildScriptedReplies } from './build-scripted-replies';

test('it queues a plain reply alone', () => {
  expect(buildScriptedReplies({ text: 'The heron left at dawn.' })).toStrictEqual([
    { text: 'The heron left at dawn.' },
  ]);
});

test('it queues the memory tool call before the reply', () => {
  expect(
    buildScriptedReplies({ text: 'I will ask first.', memory: 'The user keeps bees.' }),
  ).toStrictEqual([
    { toolUse: { name: 'mcp__nixie__memory_remember', input: { text: 'The user keeps bees.' } } },
    { text: 'I will ask first.' },
  ]);
});

test('it queues the export call before the reply', () => {
  expect(buildScriptedReplies({ text: 'The export waits for you.', export: true })).toStrictEqual([
    { toolUse: { name: 'mcp__nixie__memory_export', input: {} } },
    { text: 'The export waits for you.' },
  ]);
});

test('it queues the task start and the conversation reply for the conversation, and the task reply for the task', () => {
  const replies = buildScriptedReplies({
    text: 'I started the tide tables.',
    task: { name: 'Tide tables', brief: 'Write down the tides.', reply: 'Tides noted.' },
  });

  const conversation = { tools: [{ name: 'mcp__nixie__task_start' }] };
  const taskBody = { tools: [{ name: 'mcp__nixie__memory_recall' }] };

  expect(
    replies.map((reply) => ({
      reply: { ...reply, when: undefined },
      forConversation: reply.when?.(conversation),
      forTask: reply.when?.(taskBody),
    })),
  ).toStrictEqual([
    {
      reply: {
        toolUse: {
          name: 'mcp__nixie__task_start',
          input: { name: 'Tide tables', brief: 'Write down the tides.' },
        },
        when: undefined,
      },
      forConversation: true,
      forTask: false,
    },
    {
      reply: { text: 'I started the tide tables.', when: undefined },
      forConversation: true,
      forTask: false,
    },
    { reply: { text: 'Tides noted.', when: undefined }, forConversation: false, forTask: true },
  ]);
});
