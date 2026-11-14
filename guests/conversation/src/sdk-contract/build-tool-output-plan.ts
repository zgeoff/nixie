import type { Options } from '@anthropic-ai/claude-agent-sdk';
import { recallPageLimitBytes, toolOutputLimitTokens } from '@heynixie/wire';
import { match } from 'ts-pattern';

export type ToolOutputScenario =
  | 'past-default'
  | 'at-guest-limit'
  | 'past-guest-limit'
  | 'at-page-limit'
  | 'past-page-limit-cut'
  | 'recall-shape'
  | 'image';

export type ToolOutputTool =
  | { readonly kind: 'page'; readonly isTruncated: boolean }
  | { readonly kind: 'recall' }
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
    .with('at-page-limit', () => ({
      prompt: pagePrompt,
      served: buildFiller(recallPageLimitBytes),
      tool: { kind: 'page', isTruncated: false },
      env: guestEnv,
    }))
    .with('past-page-limit-cut', () => ({
      prompt: pagePrompt,
      served: buildFiller(30_000),
      tool: { kind: 'page', isTruncated: false },
      env: guestEnv,
    }))
    .with('recall-shape', () => ({
      prompt: pagePrompt,
      served: buildRecallShape(150, 130),
      tool: { kind: 'recall' },
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

// Lines of 100 characters, each numbered, and the last line ends the text at the length asked for.
function buildFiller(length: number): string {
  const lineWidth = 100;
  const count = Math.ceil(length / lineWidth);

  return Array.from({ length: count }, (_, index) => {
    const width = index === count - 1 ? length - index * lineWidth : lineWidth - 1;

    return `Log ${index}: `.padEnd(width, 'x');
  }).join('\n');
}

// Items in the shape of a recalled item, each padded to the size asked for in its text.
function buildRecallShape(count: number, itemBytes: number): string {
  const items = Array.from({ length: count }, (_, index) => {
    const bare = {
      itemID: `k${String(index).padStart(9, '0')}`,
      version: 1,
      text: '',
      about: `k${String(index).padStart(9, '0')} v1 · 1 Oct · you noted it`,
      subject: 'owner',
    };

    const padding = itemBytes - Buffer.byteLength(JSON.stringify(bare));

    return { ...bare, text: 'q'.repeat(Math.max(padding, 0)) };
  });

  return JSON.stringify({ items, next: null, searched: {} });
}
