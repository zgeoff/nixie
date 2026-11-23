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

test('it queues a handover ask with its reason before the reply', () => {
  const replies = buildScriptedReplies({
    text: 'I asked you to take over.',
    handover: { reason: 'itch.io asks for a CAPTCHA' },
  });

  expect(replies).toStrictEqual([
    {
      toolUse: {
        name: 'mcp__nixie__computer_handover',
        input: { reason: 'itch.io asks for a CAPTCHA' },
      },
    },
    { text: 'I asked you to take over.' },
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

test('it queues a forget of the note with the given short ID before the reply', () => {
  const replies = buildScriptedReplies({ text: 'Forgotten.', forgetNote: 'n4w8k2c6rd' });

  expect(replies).toStrictEqual([
    { toolUse: { name: 'mcp__nixie__notebook_forget', input: { id: 'n4w8k2c6rd' } } },
    { text: 'Forgotten.' },
  ]);
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

  const names = replies.map((reply) => ('toolUse' in reply ? reply.toolUse.name : 'text'));

  const inputs = replies
    .slice(0, 2)
    .map((reply) => ('toolUse' in reply ? reply.toolUse.input : null));

  expect(names).toStrictEqual([
    'mcp__nixie__notebook_write',
    'mcp__nixie__notebook_write',
    'mcp__nixie__notebook_link',
    'text',
  ]);

  expect(inputs).toStrictEqual([
    { title: 'Boiler notes', body: 'It trips at night.', tags: ['verify'] },
    { title: 'Winter diary', body: 'Dear diary, it snowed.', isPrivate: true },
  ]);
});

test('it links the notes that the writes of this turn returned, not older notes', () => {
  const link = buildScriptedReplies({
    text: 'Both notes are written.',
    notebook: {
      title: 'Boiler notes',
      body: 'It trips at night.',
      privateTitle: 'Winter diary',
      privateBody: 'Dear diary, it snowed.',
    },
  }).at(2);

  const toolUse = link !== undefined && 'toolUse' in link ? link.toolUse : undefined;
  const input = toolUse?.input;

  const messages = [
    {
      role: 'assistant',
      content: [
        {
          type: 'tool_use',
          id: 'old1',
          name: 'mcp__nixie__notebook_write',
          input: { title: 'Boiler notes' },
        },
      ],
    },
    {
      role: 'user',
      content: [
        {
          type: 'tool_result',
          tool_use_id: 'old1',
          content: '{"result":{"note":"oldnoteone","version":3}}',
        },
      ],
    },
    {
      role: 'assistant',
      content: [
        {
          type: 'tool_use',
          id: 'old2',
          name: 'mcp__nixie__notebook_write',
          input: { title: 'Winter diary' },
        },
      ],
    },
    {
      role: 'user',
      content: [
        {
          type: 'tool_result',
          tool_use_id: 'old2',
          content: '{"result":{"note":"oldnotetwo","version":1}}',
        },
      ],
    },
    {
      role: 'assistant',
      content: [
        {
          type: 'tool_use',
          id: 'new1',
          name: 'mcp__nixie__notebook_write',
          input: { title: 'Boiler notes' },
        },
      ],
    },
    {
      role: 'user',
      content: [
        {
          type: 'tool_result',
          tool_use_id: 'new1',
          content: '{"result":{"note":"n4w8k2c6rd","version":4}}',
        },
      ],
    },
    {
      role: 'assistant',
      content: [
        {
          type: 'tool_use',
          id: 'new2',
          name: 'mcp__nixie__notebook_write',
          input: { title: 'Winter diary' },
        },
      ],
    },
    {
      role: 'user',
      content: [
        {
          type: 'tool_result',
          tool_use_id: 'new2',
          content: '{"result":{"note":"d8p3q1z6mw","version":2}}',
        },
      ],
    },
  ];

  const linked = typeof input === 'function' ? input({ messages }) : input;

  expect(linked).toStrictEqual({
    from: 'd8p3q1z6mw',
    to: { note: 'n4w8k2c6rd' },
    type: 'cites',
    reason: 'the private note rests on it',
  });
});

test('it fails the link when a write was refused and an older note holds the title', () => {
  const link = buildScriptedReplies({
    text: 'Both notes are written.',
    notebook: {
      title: 'Boiler notes',
      body: 'It trips at night.',
      privateTitle: 'Winter diary',
      privateBody: 'Dear diary, it snowed.',
    },
  }).at(2);

  const toolUse = link !== undefined && 'toolUse' in link ? link.toolUse : undefined;
  const input = toolUse?.input;

  const messages = [
    {
      role: 'assistant',
      content: [
        {
          type: 'tool_use',
          id: 'old1',
          name: 'mcp__nixie__notebook_write',
          input: { title: 'Boiler notes' },
        },
      ],
    },
    {
      role: 'user',
      content: [
        {
          type: 'tool_result',
          tool_use_id: 'old1',
          content: '{"result":{"note":"oldnoteone","version":3}}',
        },
      ],
    },
    {
      role: 'assistant',
      content: [
        {
          type: 'tool_use',
          id: 'old2',
          name: 'mcp__nixie__notebook_write',
          input: { title: 'Winter diary' },
        },
      ],
    },
    {
      role: 'user',
      content: [
        {
          type: 'tool_result',
          tool_use_id: 'old2',
          content: '{"result":{"note":"oldnotetwo","version":1}}',
        },
      ],
    },
    {
      role: 'assistant',
      content: [
        {
          type: 'tool_use',
          id: 'new1',
          name: 'mcp__nixie__notebook_write',
          input: { title: 'Boiler notes' },
        },
      ],
    },
    {
      role: 'user',
      content: [
        { type: 'tool_result', tool_use_id: 'new1', content: '{"error":{"code":"REFUSED"}}' },
      ],
    },
    {
      role: 'assistant',
      content: [
        {
          type: 'tool_use',
          id: 'new2',
          name: 'mcp__nixie__notebook_write',
          input: { title: 'Winter diary' },
        },
      ],
    },
    {
      role: 'user',
      content: [
        {
          type: 'tool_result',
          tool_use_id: 'new2',
          content: '{"result":{"note":"d8p3q1z6mw","version":2}}',
        },
      ],
    },
  ];

  const readInput = typeof input === 'function' ? input : () => input;

  expect(() => readInput({ messages })).toThrow(/returned no note ID/u);
});

test('it queues the note writes before the task start when the reply holds both', () => {
  const replies = buildScriptedReplies({
    text: 'Both notes are written and the task is started.',
    notebook: {
      title: 'Boiler notes',
      body: 'It trips at night.',
      privateTitle: 'Winter diary',
      privateBody: 'Dear diary, it snowed.',
    },
    task: { name: 'Check the boiler', brief: 'Look at it.', reply: 'Checked.' },
  });

  const names = replies.map((reply) => ('toolUse' in reply ? reply.toolUse.name : 'text'));

  expect(names).toStrictEqual([
    'mcp__nixie__notebook_write',
    'mcp__nixie__notebook_write',
    'mcp__nixie__notebook_link',
    'mcp__nixie__task_start',
    'text',
    'text',
  ]);
});
