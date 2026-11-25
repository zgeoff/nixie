import { expect, test } from 'bun:test';
import { buildMockToolCall, buildMockToolContext } from '@heynixie/tools/test-utils';
import { codingDeclarations } from '../connector/coding-declarations';
import { buildCodingActionTools } from './build-coding-action-tools';

test('it declares coding.start and coding.stop as queued tools under the declarations of their attempts', () => {
  const tools = buildCodingActionTools();

  expect(
    tools.map((tool) => ({
      name: tool.name,
      execution: tool.execution,
      declaration: tool.declaration,
    })),
  ).toStrictEqual([
    { name: 'coding.start', execution: 'queued', declaration: codingDeclarations.spawn },
    { name: 'coding.stop', execution: 'queued', declaration: codingDeclarations.stop },
  ]);
});

test('it refuses to run a coding action as a call', async () => {
  const [start] = buildCodingActionTools();

  const outcome = await start?.run(
    buildMockToolCall({ tool: 'coding.start' }),
    buildMockToolContext(),
  );

  expect(outcome).toStrictEqual({ status: 'error', message: 'coding.start runs only queued' });
});
