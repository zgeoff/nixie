import type { Options } from '@anthropic-ai/claude-agent-sdk';
import { match } from 'ts-pattern';
import { buildFiller } from './build-filler';

export type OverflowScenario = 'tool-calls' | 'model-window' | 'unknown-model' | 'output-cap';

export interface OverflowPlan {
  readonly seedPrompt: string | null;
  readonly prompt: string;
  readonly options: Options;
}

export function buildOverflowPlan(options: Options, scenario: OverflowScenario): OverflowPlan {
  return match(scenario)
    .returnType<OverflowPlan>()
    .with('tool-calls', () => ({
      seedPrompt: `Here are harbour notes to keep in mind:\n${buildFiller(14_000, 'note')}\nReply with OK only.`,
      prompt:
        'Use read_page to read pages 1, 2, 3 and 4, one call at a time and in that order. Then reply DONE.',
      options,
    }))
    .with('model-window', () => ({
      seedPrompt: null,
      prompt: `${buildFiller(1_050_000, 'note')}\nReply with OK only.`,
      options: {
        ...options,
        env: {
          ...options.env,

          // The CLI's limit sits past the model's 1,000,000-token window, so the API refuses first.
          CLAUDE_CODE_BLOCKING_LIMIT_OVERRIDE: '10000000',
        },
      },
    }))
    .with('unknown-model', () => ({
      seedPrompt: null,
      prompt: 'Reply with OK only.',
      options: { ...options, model: 'claude-nonesuch-9' },
    }))
    .with('output-cap', () => ({
      seedPrompt: null,
      prompt: 'Write a 400-word story about a lighthouse.',
      options: { ...options, env: { ...options.env, CLAUDE_CODE_MAX_OUTPUT_TOKENS: '16' } },
    }))
    .exhaustive();
}
