import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { query } from '@anthropic-ai/claude-agent-sdk';
import { buildStubToolServer } from './build-stub-tool-server';
import { startStubModel } from './start-stub-model';

async function setupTest() {
  const home = await mkdtemp(join(tmpdir(), 'nixie-stub-tools-'));

  onTestFinished(() => rm(home, { recursive: true, force: true }));

  const model = startStubModel();

  onTestFinished(() => model.stop());

  return { home, model };
}

test('it serves its tools as the nixie server and records each call', async () => {
  const ctx = await setupTest();
  const tools = buildStubToolServer();

  ctx.model.addReplies(
    { toolUse: { name: 'mcp__nixie__note_wait', input: {} } },
    { toolUse: { name: 'mcp__nixie__note_read', input: { name: 'a' } } },
    { text: 'done' },
  );

  const finished = Array.fromAsync(
    query({
      prompt: 'go',
      options: {
        tools: [],
        allowedTools: ['mcp__nixie'],
        settingSources: [],
        mcpServers: { nixie: tools.config },
        cwd: ctx.home,
        env: {
          PATH: process.env['PATH'] ?? '',
          HOME: ctx.home,
          CLAUDE_CONFIG_DIR: join(ctx.home, '.claude'),
          ANTHROPIC_API_KEY: 'placeholder',
          ANTHROPIC_BASE_URL: ctx.model.url,
          CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
        },
      },
    }),
  );
  const callsWhileHeld = await tools.waitForHeldCall().then(() => [...tools.calls]);

  tools.release();
  await finished;

  expect(callsWhileHeld).toStrictEqual(['note_wait']);
  expect(tools.calls).toStrictEqual(['note_wait', 'note_read']);
  expect(JSON.stringify(ctx.model.requests.at(-1)?.body?.messages)).toInclude('the note a');
});
