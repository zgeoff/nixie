import { expect, test } from 'bun:test';
import { formatStepSummary } from './format-step-summary';

test('it names the tool once with the host of each page it fetched', () => {
  expect(
    formatStepSummary({
      calls: [
        { callID: 'a', input: { url: 'https://www.theverge.com/' }, tool: 'web_fetch' },
        { callID: 'b', input: { url: 'https://arstechnica.com/gadgets/' }, tool: 'web_fetch' },
        { callID: 'c', input: { url: 'https://news.ycombinator.com/' }, tool: 'web_fetch' },
      ],
      key: 1,
      kind: 'step',
      records: [],
      status: 'done',
    }),
  ).toBe('web fetch: theverge.com, arstechnica.com, news.ycombinator.com');
});

test('it lists each tool of a step that called several', () => {
  expect(
    formatStepSummary({
      calls: [
        { callID: 'a', input: { url: 'https://example.com/' }, tool: 'web_fetch' },
        { callID: 'b', input: { text: 'remember the milk' }, tool: 'test.send' },
      ],
      key: 1,
      kind: 'step',
      records: [],
      status: 'done',
    }),
  ).toBe('web fetch: example.com; test send: remember the milk');
});

test('it names the task of a step that called no tool', () => {
  expect(
    formatStepSummary({
      calls: [],
      key: 1,
      kind: 'step',
      records: [],
      status: 'done',
      taskID: 'conversation',
    }),
  ).toBe('conversation: no tools');
});

test('it names a tool alone when its input holds no text', () => {
  expect(
    formatStepSummary({
      calls: [{ callID: 'a', input: { count: 3 }, tool: 'clock.now' }],
      key: 1,
      kind: 'step',
      records: [],
      status: 'done',
    }),
  ).toBe('clock now');
});

test('it clips a long target', () => {
  expect(
    formatStepSummary({
      calls: [{ callID: 'a', input: { query: 'a'.repeat(80) }, tool: 'search' }],
      key: 1,
      kind: 'step',
      records: [],
      status: 'done',
    }),
  ).toBe(`search: ${'a'.repeat(60)}…`);
});

test('it says how a step that has not ended stands', () => {
  expect(
    formatStepSummary({
      calls: [{ callID: 'a', input: { url: 'https://example.com/' }, tool: 'web_fetch' }],
      key: 1,
      kind: 'step',
      records: [],
      status: 'running',
    }),
  ).toBe('web fetch: example.com (running)');
});
