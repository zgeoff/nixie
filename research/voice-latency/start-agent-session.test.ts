import { expect, onTestFinished, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startAgentSession } from './start-agent-session.ts';
import { buildStubAgentQuery } from './test-utils/build-stub-agent-query.ts';

function setupTest() {
  const scratchDir = mkdtempSync(join(tmpdir(), 'agent-session-'));
  onTestFinished(() => rmSync(scratchDir, { force: true, recursive: true }));
  return { scratchDir };
}

test('it gives each turn its own cost from the session total', async () => {
  const ctx = setupTest();
  const stub = buildStubAgentQuery([
    [{ is_error: false, subtype: 'success', total_cost_usd: 0.002, type: 'result' }],
    [{ is_error: false, subtype: 'success', total_cost_usd: 0.005, type: 'result' }],
  ]);
  const session = startAgentSession({
    allowedTools: [],
    effort: 'low',
    env: {},
    model: 'claude-haiku-5-5',
    query: stub.query,
    scratchDir: ctx.scratchDir,
    systemPrompt: 'You are a helpful voice assistant.',
    writeLog: () => undefined,
  });
  onTestFinished(session.close);
  const first = await session.runTurn('What time is it?', () => undefined);

  const second = await session.runTurn('And the weather?', () => undefined);

  expect(first.costUSD).toBe(0.002);
  expect(second.costUSD).toBeCloseTo(0.003, 10);
});

test('it streams the reply text and returns the tools the model called', async () => {
  const ctx = setupTest();
  const stub = buildStubAgentQuery([
    [
      { message: { content: [{ name: 'read_weather', type: 'tool_use' }] }, type: 'assistant' },
      {
        event: { delta: { text: 'Sunny in Lyon.', type: 'text_delta' }, type: 'content_block_delta' },
        parent_tool_use_id: null,
        type: 'stream_event',
      },
      { is_error: false, subtype: 'success', total_cost_usd: 0.001, ttft_stream_ms: 410, type: 'result' },
    ],
  ]);
  const session = startAgentSession({
    allowedTools: ['read_weather'],
    effort: 'low',
    env: {},
    model: 'claude-haiku-5-5',
    query: stub.query,
    scratchDir: ctx.scratchDir,
    systemPrompt: 'You are a helpful voice assistant.',
    writeLog: () => undefined,
  });
  onTestFinished(session.close);
  const texts: string[] = [];

  const turn = await session.runTurn('What is the weather in Lyon?', (delta) => texts.push(delta));

  expect(texts).toStrictEqual(['Sunny in Lyon.']);
  expect(turn).toStrictEqual({
    costUSD: 0.001,
    isError: false,
    resultAt: expect.any(Number),
    subtype: 'success',
    toolCalls: ['read_weather'],
    ttftStreamMs: 410,
  });
  expect(stub.prompts).toStrictEqual(['What is the weather in Lyon?']);
});
