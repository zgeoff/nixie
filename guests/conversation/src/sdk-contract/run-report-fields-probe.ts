import { onTestFinished } from 'bun:test';
import type { StubToolCall } from '../test-utils/start-stub-changing-tool-server';
import { startStubChangingToolServer } from '../test-utils/start-stub-changing-tool-server';
import { buildProbeOptions } from './build-probe-options';
import type { ContractRun } from './run-contract-query';
import { runContractQuery } from './run-contract-query';
import type { ProbeTarget } from './types';

export interface ReportFieldsRun {
  readonly calls: readonly StubToolCall[];
  readonly run: ContractRun;
}

// One call to a tool whose input has an untyped `fields` object, the shape of the report call. It
// shows whether the SDK passes a nested object to an HTTP tool server as the model wrote it.
export async function runReportFieldsProbe(target: ProbeTarget): Promise<ReportFieldsRun> {
  const tools = startStubChangingToolServer({
    description: 'Sends the report of the run.',
    inputSchema: {
      properties: { summary: { type: 'string' }, fields: { type: 'object' } },
      required: ['summary'],
    },
  });

  onTestFinished(() => tools.stop());

  const run = await runContractQuery({
    prompt:
      'Call note_read once with the summary "Found two cafes." and the fields city Lyon and ' +
      'stops an array of the names Alma and Bar, then reply DONE.',
    options: {
      ...buildProbeOptions(target),
      allowedTools: ['mcp__nixie'],
      permissionMode: 'dontAsk',
      strictMcpConfig: true,
      maxTurns: 4,
      mcpServers: { nixie: tools.config },
      systemPrompt: 'You are a terse assistant in a test. Follow the instructions exactly.',
    },
  });

  return { calls: [...tools.calls], run };
}
