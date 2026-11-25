import { expect, test } from 'bun:test';
import type { JSONObject } from '@heynixie/log';
import type { TranscriptTurn } from '../types';
import { collectTail } from './collect-tail';

test.each<[string, TranscriptTurn[], { count: number; limit: number }, JSONObject]>([
  [
    'whole turns oldest first with cut false when every asked turn fits',
    [
      { user: 'first ask', assistant: 'first reply', tools: ['Read'] },
      { user: 'second ask', assistant: 'second reply', tools: ['Edit'] },
      { user: 'third ask', assistant: 'third reply', tools: [] },
    ],
    { count: 2, limit: 1000 },
    {
      turns: [
        { user: 'second ask', assistant: 'second reply', tools: ['Edit'] },
        { user: 'third ask', assistant: 'third reply', tools: [] },
      ],
      cut: false,
    },
  ],
  [
    'every turn with cut false when the transcript holds fewer turns than asked',
    [
      { user: 'first ask', assistant: 'first reply', tools: [] },
      { user: 'second ask', assistant: 'second reply', tools: ['Bash'] },
    ],
    { count: 5, limit: 1000 },
    {
      turns: [
        { user: 'first ask', assistant: 'first reply', tools: [] },
        { user: 'second ask', assistant: 'second reply', tools: ['Bash'] },
      ],
      cut: false,
    },
  ],
  [
    'the newest turns that fit with cut true when older turns pass the limit',
    [
      { user: 'aaaa', assistant: 'AAAA', tools: ['1'] },
      { user: 'bbbb', assistant: 'BBBB', tools: ['2'] },
      { user: 'cccc', assistant: 'CCCC', tools: ['3'] },
    ],
    { count: 3, limit: 20 },
    {
      turns: [
        { user: 'bbbb', assistant: 'BBBB', tools: ['2'] },
        { user: 'cccc', assistant: 'CCCC', tools: ['3'] },
      ],
      cut: true,
    },
  ],
  [
    "the end of the newest turn's reply with cut true when that turn alone passes the limit",
    [
      { user: 'old ask', assistant: 'old reply', tools: [] },
      { user: 'u', assistant: `${'x'.repeat(10)}${'y'.repeat(20)}`, tools: ['Read'] },
    ],
    { count: 2, limit: 15 },
    { turns: [{ user: 'u', assistant: 'y'.repeat(10), tools: ['Read'] }], cut: true },
  ],
  [
    "the end of the newest turn's ask and no reply when that ask alone passes the limit",
    [{ user: `${'v'.repeat(10)}${'u'.repeat(10)}`, assistant: 'the whole reply', tools: [] }],
    { count: 1, limit: 10 },
    { turns: [{ user: 'u'.repeat(10), assistant: '', tools: [] }], cut: true },
  ],
  [
    'the newest tool names that fit, and the end of the reply, when the tool names alone pass the limit',
    [{ user: 'u', assistant: 'the reply', tools: ['Read', 'Edit', 'Bash'] }],
    { count: 1, limit: 10 },
    { turns: [{ user: 'u', assistant: 'y', tools: ['Edit', 'Bash'] }], cut: true },
  ],
  [
    'no turns with cut false for an empty transcript',
    [],
    { count: 3, limit: 1000 },
    { turns: [], cut: false },
  ],
])('it collects %s', (_label, turns, asked, tail) => {
  expect(collectTail(turns, asked.count, asked.limit)).toStrictEqual(tail);
});
