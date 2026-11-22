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
    {
      toolUse: {
        name: 'mcp__nixie__memory_remember',
        input: { text: 'The user keeps bees.', gist: 'a scripted note', topic: 'verify' },
      },
    },
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

test('it queues a draw, an edit of the drawn picture, and a list before the reply', () => {
  const replies = buildScriptedReplies({
    text: 'Here are both pictures.',
    draw: { prompt: 'A heron at dawn.', edit: 'Make the sky pink.' },
  });

  const body = {
    messages: [{ role: 'user', content: '{"result":{"image":"cm1abc","size":"1024x1024"}}' }],
  };

  const inputs = replies.map((reply) => {
    const input = 'toolUse' in reply ? reply.toolUse?.input : undefined;

    return typeof input === 'function' ? input(body) : input;
  });

  expect(inputs).toStrictEqual([
    { prompt: 'A heron at dawn.' },
    { prompt: 'Make the sky pink.', from: 'cm1abc' },
    {},
    undefined,
  ]);
});

test('it queues a send of a picture after the list when the draw asks for it', () => {
  const replies = buildScriptedReplies({
    text: 'Here is the picture.',
    draw: { prompt: 'A heron at dawn.', edit: 'Make the sky pink.', send: true },
  });

  const body = {
    messages: [{ role: 'user', content: '{"result":{"image":"cm1abc","size":"1024x1024"}}' }],
  };

  const calls = replies.map((reply) => {
    const toolUse = 'toolUse' in reply ? reply.toolUse : undefined;
    const input = toolUse?.input;

    return { name: toolUse?.name, input: typeof input === 'function' ? input(body) : input };
  });

  expect(calls.at(-2)).toStrictEqual({ name: 'mcp__nixie__file_send', input: { file: 'cm1abc' } });
});

test('it queues 2 note writes and a link from the private note to the first', () => {
  const replies = buildScriptedReplies({
    text: 'Both notes are written.',
    notebook: {
      title: 'Boiler notes',
      body: 'It trips at night.',
      privateTitle: 'Winter diary',
      privateBody: 'Dear diary, it snowed.',
    },
  });

  const body = {
    messages: [
      { role: 'user', content: '{"result":{"note":"n4w8k2c6rd","version":1}}' },
      { role: 'user', content: '{"result":{"note":"d8p3q1z6mw","version":1}}' },
    ],
  };

  const calls = replies.map((reply) => {
    const toolUse = 'toolUse' in reply ? reply.toolUse : undefined;
    const input = toolUse?.input;

    return { name: toolUse?.name, input: typeof input === 'function' ? input(body) : input };
  });

  expect(calls).toStrictEqual([
    {
      name: 'mcp__nixie__notebook_write',
      input: { title: 'Boiler notes', body: 'It trips at night.', tags: ['verify'] },
    },
    {
      name: 'mcp__nixie__notebook_write',
      input: { title: 'Winter diary', body: 'Dear diary, it snowed.', isPrivate: true },
    },
    {
      name: 'mcp__nixie__notebook_link',
      input: {
        from: 'd8p3q1z6mw',
        to: { note: 'n4w8k2c6rd' },
        type: 'cites',
        reason: 'the private note rests on it',
      },
    },
    { name: undefined, input: undefined },
  ]);
});
