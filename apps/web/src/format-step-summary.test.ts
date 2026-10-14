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
  ).toBe('task · web fetch: theverge.com, arstechnica.com, news.ycombinator.com');
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
  ).toBe('task · web fetch: example.com; test send: remember the milk');
});

test('it names the task of a step that called no tool', () => {
  expect(formatStepSummary(buildMockStepActivity({ calls: [], taskID: 'conversation' }))).toBe(
    'conversation · no tools',
  );
});

test('it names a tool alone when its input holds no text', () => {
  expect(
    formatStepSummary(
      buildMockStepActivity({
        calls: [{ callID: 'a', input: { count: 3 }, tool: 'clock.now' }],
      }),
    ),
  ).toBe('task · clock now');
});

test('it clips a long target', () => {
  const step = buildMockStepActivity({
    calls: [{ callID: 'a', input: { query: 'a'.repeat(80) }, tool: 'search' }],
  });

  expect(formatStepSummary(step)).toBe(`task · search: ${'a'.repeat(60)}…`);
});

test('it says how a step that has not ended stands', () => {
  expect(
    formatStepSummary(
      buildMockStepActivity({
        calls: [{ callID: 'a', input: { url: 'https://example.com/' }, tool: 'web_fetch' }],
        status: 'running',
      }),
    ),
  ).toBe('task · running · web fetch: example.com');
});

test('it counts the memories a step recalled and gives how long it ran', () => {
  expect(
    formatStepSummary(
      buildMockStepActivity({
        durationMs: 12_345,
        memories: [
          { itemID: 'item-a', score: 0.61, version: 1 },
          { itemID: 'item-b', score: 0.42, version: 3 },
        ],
        taskID: 'conversation',
      }),
    ),
  ).toBe('conversation · 2 memories · no tools · 12.3s');
});

test.each([
  [0, '0 memories'],
  [1, '1 memory'],
])('it counts a recall that delivered %d items as %s', (count, part) => {
  const memories = Array.from({ length: count }, (_, index) => ({
    itemID: `item-${index}`,
    version: 1,
  }));

  expect(formatStepSummary(buildMockStepActivity({ memories, taskID: 'conversation' }))).toBe(
    `conversation · ${part} · no tools`,
  );
});

test('it counts the memories the model rated as noise beside the memory count', () => {
  expect(
    formatStepSummary(
      buildMockStepActivity({
        memories: [
          {
            itemID: 'item-a',
            rating: { hasNote: true, sequence: 9, verdict: 'noise' },
            version: 1,
          },
          {
            itemID: 'item-b',
            rating: { hasNote: false, sequence: 9, verdict: 'helpful' },
            version: 1,
          },
          {
            itemID: 'item-c',
            rating: { hasNote: false, sequence: 9, verdict: 'misleading' },
            version: 1,
          },
          { itemID: 'item-d', version: 1 },
          { itemID: 'item-e', version: 1 },
        ],
        taskID: 'conversation',
      }),
    ),
  ).toBe('conversation · 5 memories (1 noise) · no tools');
});

test('it gives a step of a minute or more in minutes and seconds', () => {
  expect(
    formatStepSummary(buildMockStepActivity({ durationMs: 65_400, taskID: 'conversation' })),
  ).toBe('conversation · no tools · 1m 5s');
});

test('it says a failed step failed, with its error', () => {
  expect(
    formatStepSummary(
      buildMockStepActivity({
        error: 'the model profile is unreachable',
        status: 'failed',
        taskID: 'conversation',
      }),
    ),
  ).toBe('conversation · failed: the model profile is unreachable · no tools');
});

test('it clips a long error', () => {
  const step = buildMockStepActivity({ error: 'e'.repeat(100), status: 'failed' });

  expect(formatStepSummary(step)).toBe(`task · failed: ${'e'.repeat(80)}… · no tools`);
});

test('it says a failed step with no readable error failed', () => {
  expect(formatStepSummary(buildMockStepActivity({ status: 'failed' }))).toBe(
    'task · failed · no tools',
  );
});
