import { onTestFinished } from 'bun:test';
import type { Options } from '@anthropic-ai/claude-agent-sdk';
import invariant from 'tiny-invariant';
import { match } from 'ts-pattern';
import type {
  StubChangingToolServer,
  StubToolCall,
} from '../test-utils/start-stub-changing-tool-server';
import { startStubChangingToolServer } from '../test-utils/start-stub-changing-tool-server';
import { buildProbeOptions } from './build-probe-options';
import type { ToolListScenario } from './build-tool-list-plan';
import { buildToolListPlan } from './build-tool-list-plan';
import type { ContractRun } from './run-contract-query';
import { runContractQuery } from './run-contract-query';
import type { ProbeTarget } from './types';

export interface ToolListRun {
  readonly calls: readonly StubToolCall[];
  readonly run: ContractRun;
  readonly toolsURL: string;
}

export async function runToolListProbe(
  target: ProbeTarget,
  scenario: ToolListScenario,
): Promise<ToolListRun> {
  const tools = startStubChangingToolServer({
    description: 'Reads a note by its name.',
    inputSchema: { properties: { name: { type: 'string' } }, required: ['name'] },
  });

  onTestFinished(() => tools.stop());

  const plan = buildToolListPlan(
    {
      ...buildProbeOptions(target),
      allowedTools: ['mcp__nixie'],
      permissionMode: 'dontAsk',
      strictMcpConfig: true,
      maxTurns: 6,
      mcpServers: { nixie: tools.config },
      systemPrompt: {
        type: 'custom',
        prompt: 'You are a terse assistant in a test. Follow the instructions exactly.',
        snapshot: false,
      },
    },
    scenario,
  );

  const run = await match(plan)
    .with({ kind: 'resumed' }, (resumed) => runResumed(resumed.options, tools))
    .with({ kind: 'mid-turn' }, (midTurn) =>
      runMidTurn(midTurn.options, tools, midTurn.isNoticeSent),
    )
    .exhaustive();

  return { calls: [...tools.calls], run, toolsURL: tools.config.url };
}

const changedForm = {
  description: 'Reads a note by its short ID. The note called groceries has the short ID n7k2.',
  inputSchema: { properties: { noteID: { type: 'string' } }, required: ['noteID'] },
};

async function runResumed(options: Options, tools: StubChangingToolServer): Promise<ContractRun> {
  const first = await runContractQuery({
    prompt: 'Call note_read once for the note called groceries, then reply DONE.',
    options,
  });

  const boundary = first.messages.findLast((message) => message.type === 'assistant');

  invariant(boundary, 'the first turn of the tool-list probe streamed no reply');

  tools.changeTool(changedForm);

  return runContractQuery({
    prompt: 'Call note_read once more for the note called groceries, then reply DONE.',
    options: {
      ...options,
      resume: boundary.session_id,
      resumeSessionAt: boundary.uuid,
      forkSession: true,
    },
  });
}

async function runMidTurn(
  options: Options,
  tools: StubChangingToolServer,
  isNoticeSent: boolean,
): Promise<ContractRun> {
  const run = runContractQuery({
    prompt:
      'Call note_wait once. When it returns, call note_read once for the note called ' +
      'groceries, then reply DONE.',
    options,
  });

  const isHeld = await Promise.race([
    tools.waitForHeldCall().then(() => true),
    run.then(() => false),
  ]);

  if (!isHeld) {
    throw new Error('the model ended the turn of the tool-list probe before it called note_wait');
  }

  tools.changeTool(changedForm);

  if (isNoticeSent) {
    await tools.notifyToolsChanged();
  }

  tools.release();

  return run;
}
