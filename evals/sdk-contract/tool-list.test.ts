import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Options } from '@anthropic-ai/claude-agent-sdk';
import { startStubChangingToolServer } from '@heynixie/conversation/test-utils';
import invariant from 'tiny-invariant';
import { buildContractEnv } from '../test-utils/build-contract-env';
import { runContractQuery } from '../test-utils/run-contract-query';

// The probes call the model on the subscription, so only a contract run enables them. Bun 1.4.2's
// skipIf takes a boolean and has no in-body skip.
const isContractRun = process.env['NIXIE_SDK_CONTRACT'] === '1';

// a config directory of the run's own, and the options of a turn as the conversation guest sets
// them, the system prompt's snapshot off included, with no tool server yet
async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'nixie-contract-tool-list-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const options: Options = {
    cwd: directory,
    model: 'claude-haiku-5-5',
    settingSources: [],
    tools: [],
    allowedTools: ['mcp__nixie'],
    permissionMode: 'dontAsk',
    strictMcpConfig: true,
    maxTurns: 6,
    systemPrompt: {
      type: 'custom',
      prompt: 'You are a terse assistant in a test. Follow the instructions exactly.',
      snapshot: false,
    },
    env: buildContractEnv(process.env, directory),
  };

  return { options };
}

test.skipIf(!isContractRun)(
  'it calls a tool in its changed form on the next turn of a resumed session',
  async () => {
    const ctx = await setupTest();

    const tools = startStubChangingToolServer({
      description: 'Reads a note by its name.',
      inputSchema: { properties: { name: { type: 'string' } }, required: ['name'] },
    });

    onTestFinished(() => tools.stop());

    const options: Options = { ...ctx.options, mcpServers: { nixie: tools.config } };

    const first = await runContractQuery({
      prompt: 'Call note_read once for the note called groceries, then reply DONE.',
      options,
    });

    const boundary = first.messages.findLast((message) => message.type === 'assistant');

    invariant(boundary);

    tools.changeTool({
      description: 'Reads a note by its short ID. The note called groceries has the short ID n7k2.',
      inputSchema: { properties: { noteID: { type: 'string' } }, required: ['noteID'] },
    });

    await runContractQuery({
      prompt: 'Call note_read once more for the note called groceries, then reply DONE.',
      options: {
        ...options,
        resume: boundary.session_id,
        resumeSessionAt: boundary.uuid,
        forkSession: true,
      },
    });

    expect(tools.calls).toStrictEqual([
      { name: 'note_read', arguments: { name: 'groceries' } },
      { name: 'note_read', arguments: { noteID: 'n7k2' } },
    ]);
  },
  300_000,
);

test.skipIf(!isContractRun)(
  'it keeps the recorded form of a tool on a resumed session that snapshots its system prompt',
  async () => {
    const ctx = await setupTest();

    const tools = startStubChangingToolServer({
      description: 'Reads a note by its name.',
      inputSchema: { properties: { name: { type: 'string' } }, required: ['name'] },
    });

    onTestFinished(() => tools.stop());

    const options: Options = {
      ...ctx.options,
      mcpServers: { nixie: tools.config },
      systemPrompt: 'You are a terse assistant in a test. Follow the instructions exactly.',
    };

    const first = await runContractQuery({
      prompt: 'Call note_read once for the note called groceries, then reply DONE.',
      options,
    });

    const boundary = first.messages.findLast((message) => message.type === 'assistant');

    invariant(boundary);

    tools.changeTool({
      description: 'Reads a note by its short ID. The note called groceries has the short ID n7k2.',
      inputSchema: { properties: { noteID: { type: 'string' } }, required: ['noteID'] },
    });

    await runContractQuery({
      prompt: 'Call note_read once more for the note called groceries, then reply DONE.',
      options: {
        ...options,
        resume: boundary.session_id,
        resumeSessionAt: boundary.uuid,
        forkSession: true,
      },
    });

    expect(tools.calls).toStrictEqual([
      { name: 'note_read', arguments: { name: 'groceries' } },
      { name: 'note_read', arguments: { name: 'groceries' } },
    ]);
  },
  300_000,
);

test.skipIf(!isContractRun)(
  'it calls a tool in its listed form at the next step of a turn when the server sends no notice',
  async () => {
    const ctx = await setupTest();

    const tools = startStubChangingToolServer({
      description: 'Reads a note by its name.',
      inputSchema: { properties: { name: { type: 'string' } }, required: ['name'] },
    });

    onTestFinished(() => tools.stop());

    const options: Options = { ...ctx.options, mcpServers: { nixie: tools.config } };

    const run = runContractQuery({
      prompt:
        'Call note_wait once. When it returns, call note_read once for the note called ' +
        'groceries, then reply DONE.',
      options,
    });

    await tools.waitForHeldCall();

    tools.changeTool({
      description: 'Reads a note by its short ID. The note called groceries has the short ID n7k2.',
      inputSchema: { properties: { noteID: { type: 'string' } }, required: ['noteID'] },
    });

    tools.release();

    await run;

    expect(tools.calls).toStrictEqual([
      { name: 'note_wait', arguments: {} },
      { name: 'note_read', arguments: { name: 'groceries' } },
    ]);
  },
  300_000,
);

test.skipIf(!isContractRun)(
  'it calls a tool in its changed form at the next step of a turn once it lists the tools after a notice',
  async () => {
    const ctx = await setupTest();

    const tools = startStubChangingToolServer({
      description: 'Reads a note by its name.',
      inputSchema: { properties: { name: { type: 'string' } }, required: ['name'] },
    });

    onTestFinished(() => tools.stop());

    const options: Options = { ...ctx.options, mcpServers: { nixie: tools.config } };

    const run = runContractQuery({
      prompt:
        'Call note_wait once. When it returns, call note_read once for the note called ' +
        'groceries, then reply DONE.',
      options,
    });

    await tools.waitForHeldCall();

    tools.changeTool({
      description: 'Reads a note by its short ID. The note called groceries has the short ID n7k2.',
      inputSchema: { properties: { noteID: { type: 'string' } }, required: ['noteID'] },
    });

    await tools.notifyToolsChanged();

    tools.release();

    await run;

    expect(tools.calls).toStrictEqual([
      { name: 'note_wait', arguments: {} },
      { name: 'note_read', arguments: { noteID: 'n7k2' } },
    ]);
  },
  300_000,
);
