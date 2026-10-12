import { expect, test } from 'bun:test';
import { formatStepSummary } from './format-step-summary';
import { buildMockStepActivity } from './test-utils/build-mock-step-activity';

test('it names the tool once with the host of each page it fetched', () => {
  expect(
    formatStepSummary(
      buildMockStepActivity({
        calls: [
          { callID: 'a', input: { url: 'https://www.theverge.com/' }, tool: 'web_fetch' },
          { callID: 'b', input: { url: 'https://arstechnica.com/gadgets/' }, tool: 'web_fetch' },
          { callID: 'c', input: { url: 'https://news.ycombinator.com/' }, tool: 'web_fetch' },
        ],
      }),
    ),
  ).toBe('web fetch: theverge.com, arstechnica.com, news.ycombinator.com');
});

test('it lists each tool of a step that called several', () => {
  expect(
    formatStepSummary(
      buildMockStepActivity({
        calls: [
          { callID: 'a', input: { url: 'https://example.com/' }, tool: 'web_fetch' },
          { callID: 'b', input: { text: 'remember the milk' }, tool: 'test.send' },
        ],
      }),
    ),
  ).toBe('web fetch: example.com; test send: remember the milk');
});

test('it names the task of a step that called no tool', () => {
  expect(formatStepSummary(buildMockStepActivity({ calls: [], taskID: 'conversation' }))).toBe(
    'conversation: no tools',
  );
});

test('it names a tool alone when its input holds no text', () => {
  expect(
    formatStepSummary(
      buildMockStepActivity({
        calls: [{ callID: 'a', input: { count: 3 }, tool: 'clock.now' }],
      }),
    ),
  ).toBe('clock now');
});

test('it clips a long target', () => {
  const step = buildMockStepActivity({
    calls: [{ callID: 'a', input: { query: 'a'.repeat(80) }, tool: 'search' }],
  });

  expect(formatStepSummary(step)).toBe(`search: ${'a'.repeat(60)}…`);
});

test('it says how a step that has not ended stands', () => {
  expect(
    formatStepSummary(
      buildMockStepActivity({
        calls: [{ callID: 'a', input: { url: 'https://example.com/' }, tool: 'web_fetch' }],
        status: 'running',
      }),
    ),
  ).toBe('web fetch: example.com (running)');
});
