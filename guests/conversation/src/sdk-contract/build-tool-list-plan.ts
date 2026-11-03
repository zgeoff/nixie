import type { Options } from '@anthropic-ai/claude-agent-sdk';
import { match } from 'ts-pattern';

export type ToolListScenario =
  | 'resumed-session'
  | 'resumed-snapshot'
  | 'mid-turn-silent'
  | 'mid-turn-notice';

export type ToolListPlan =
  | { readonly kind: 'resumed'; readonly options: Options }
  | { readonly kind: 'mid-turn'; readonly options: Options; readonly isNoticeSent: boolean };

export function buildToolListPlan(options: Options, scenario: ToolListScenario): ToolListPlan {
  return match(scenario)
    .returnType<ToolListPlan>()
    .with('resumed-session', () => ({ kind: 'resumed', options }))
    .with('resumed-snapshot', () => ({
      kind: 'resumed',
      options: {
        ...options,
        systemPrompt: 'You are a terse assistant in a test. Follow the instructions exactly.',
      },
    }))
    .with('mid-turn-silent', () => ({ kind: 'mid-turn', options, isNoticeSent: false }))
    .with('mid-turn-notice', () => ({ kind: 'mid-turn', options, isNoticeSent: true }))
    .exhaustive();
}
