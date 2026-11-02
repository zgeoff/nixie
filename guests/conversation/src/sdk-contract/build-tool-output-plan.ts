import type { Options } from '@anthropic-ai/claude-agent-sdk';
import { toolOutputLimitTokens } from '@heynixie/wire';
import { match } from 'ts-pattern';

export type ToolOutputScenario = 'past-default' | 'at-guest-limit' | 'past-guest-limit' | 'image';

export type ToolOutputTool =
  | { readonly kind: 'page'; readonly isTruncated: boolean }
  | { readonly kind: 'photo' };

export interface ToolOutputPlan {
  readonly prompt: string;
  readonly served: string;
  readonly tool: ToolOutputTool;
  readonly env: NonNullable<Options['env']>;
}

export function buildToolOutputPlan(
  env: Options['env'],
  scenario: ToolOutputScenario,
): ToolOutputPlan {
  const guestEnv = {
    ...env,
    MAX_MCP_OUTPUT_TOKENS: String(toolOutputLimitTokens),
    ENABLE_MCP_LARGE_OUTPUT_FILES: '0',
  };

  const pagePrompt = 'Call read_page once for page 1, then reply DONE.';

  return match(scenario)
    .returnType<ToolOutputPlan>()
    .with('past-default', () => ({
      prompt: pagePrompt,
      served: buildLog(700),
      tool: { kind: 'page', isTruncated: false },
      env: env ?? {},
    }))
    .with('at-guest-limit', () => ({
      prompt: pagePrompt,
      served: buildLog(240),
      tool: { kind: 'page', isTruncated: true },
      env: guestEnv,
    }))
    .with('past-guest-limit', () => ({
      prompt: pagePrompt,
      served: buildLog(1500),
      tool: { kind: 'page', isTruncated: false },
      env: guestEnv,
    }))
    .with('image', () => ({
      prompt: 'Call read_photo once for page 1, then reply DONE.',
      served: '{"eventID":"12","number":1}',
      tool: { kind: 'photo' },
      env: guestEnv,
    }))
    .exhaustive();
}

function buildLog(lines: number): string {
  return Array.from(
    { length: lines },
    (_, index) =>
      `Log ${index}: the lamp burned [→ https://lighthouses.example/archive/log/${index}/entry]`,
  ).join('\n');
}
