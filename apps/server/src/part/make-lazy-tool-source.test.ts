import { expect, test } from 'bun:test';
import { buildToolRegistry } from '@heynixie/tools';
import { buildMockToolDefinition } from '@heynixie/tools/test-utils';
import { makeLazyToolSource } from './make-lazy-tool-source';

test('it has no tools before its source starts, and the source tools after', () => {
  const started = buildToolRegistry([buildMockToolDefinition({ name: 'tracker.item_get' })]);
  const slot: { source: typeof started | null } = { source: null };

  const lazy = makeLazyToolSource(() =>
    slot.source === null
      ? null
      : {
          toolNames: () => slot.source?.toolNames ?? [],
          findTool: (name) => started.findTool(name),
          prepareTaskRun: () => Promise.resolve(),
        },
  );

  const before = lazy.toolNames();

  slot.source = started;

  expect([
    before,
    lazy.toolNames(),
    lazy.findTool('tracker.item_get')?.definition.name,
  ]).toStrictEqual([[], ['tracker.item_get'], 'tracker.item_get']);
});

test('it passes the tools of a task run to its source once the source has started', async () => {
  const asked: string[] = [];

  const lazy = makeLazyToolSource(() => ({
    toolNames: () => [],
    findTool: () => null,
    prepareTaskRun: (names) => {
      asked.push(...names);

      return Promise.resolve();
    },
  }));

  await lazy.prepareTaskRun?.(['tracker.item_get']);

  expect(asked).toStrictEqual(['tracker.item_get']);
});
