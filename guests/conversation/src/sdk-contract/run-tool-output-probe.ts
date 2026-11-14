import type { McpSdkServerConfigWithInstance } from '@anthropic-ai/claude-agent-sdk';
import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk';
import { match } from 'ts-pattern';
import { z } from 'zod';
import { buildProbeOptions } from './build-probe-options';
import type { ToolOutputScenario, ToolOutputTool } from './build-tool-output-plan';
import { buildToolOutputPlan } from './build-tool-output-plan';
import type { ContractRun } from './run-contract-query';
import { runContractQuery } from './run-contract-query';
import type { ProbeTarget } from './types';

export interface ToolOutputRun {
  readonly served: string;
  readonly run: ContractRun;
}

export async function runToolOutputProbe(
  target: ProbeTarget,
  scenario: ToolOutputScenario,
): Promise<ToolOutputRun> {
  const options = buildProbeOptions(target);
  const plan = buildToolOutputPlan(options.env, scenario);

  const run = await runContractQuery({
    prompt: plan.prompt,
    options: {
      ...options,
      allowedTools: ['mcp__pages'],
      permissionMode: 'dontAsk',
      maxTurns: 3,
      systemPrompt: 'You are a terse assistant in a test. Follow the instructions exactly.',
      mcpServers: { pages: createToolServer(plan.tool, plan.served) },
      env: plan.env,
    },
  });

  return { served: plan.served, run };
}

function createToolServer(form: ToolOutputTool, text: string): McpSdkServerConfigWithInstance {
  return match(form)
    .with({ kind: 'page' }, (page) => createPageServer(text, page.isTruncated))
    .with({ kind: 'recall' }, () => createRecallServer(text))
    .with({ kind: 'photo' }, () => createPhotoServer(text))
    .exhaustive();
}

function createPageServer(text: string, isTruncated: boolean): McpSdkServerConfigWithInstance {
  return createSdkMcpServer({
    name: 'pages',
    version: '0.0.0',
    tools: [
      tool('read_page', 'Reads the lighthouse archive page.', { page: z.number().int() }, () =>
        Promise.resolve({
          content: [],
          structuredContent: { status: 200, text, isTruncated, blocked: null },
        }),
      ),
    ],
  });
}

function createRecallServer(json: string): McpSdkServerConfigWithInstance {
  const result = z.record(z.string(), z.unknown()).parse(JSON.parse(json));

  return createSdkMcpServer({
    name: 'pages',
    version: '0.0.0',
    tools: [
      tool('read_page', 'Reads the lighthouse archive page.', { page: z.number().int() }, () =>
        Promise.resolve({ content: [], structuredContent: result }),
      ),
    ],
  });
}

function createPhotoServer(text: string): McpSdkServerConfigWithInstance {
  return createSdkMcpServer({
    name: 'pages',
    version: '0.0.0',
    tools: [
      tool('read_photo', 'Reads the lighthouse photo.', { page: z.number().int() }, () =>
        Promise.resolve({
          content: [
            { type: 'text' as const, text },
            {
              type: 'image' as const,
              data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==',
              mimeType: 'image/png',
            },
          ],
        }),
      ),
    ],
  });
}
