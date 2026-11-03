import { match } from 'ts-pattern';

export type ModPolicyScenario = 'policy' | 'throw-load' | 'throw-hook-catch' | 'busy-loop';

export interface ModPolicyPlan {
  readonly mod: string;
  readonly prompt: string;
}

export function buildModPolicyPlan(scenario: ModPolicyScenario): ModPolicyPlan {
  return match(scenario)
    .with('policy', () => ({
      mod: 'nixie-policy',
      prompt:
        'Run each of these shell commands with the Bash tool, one tool call per command, one after ' +
        'another, never in parallel. Do not retry or change any command.\n' +
        '1. echo plain MARK_NONE\n2. echo blocked MARK_DENY\n3. echo original MARK_REWRITE\n' +
        '4. echo original MARK_ANSWER\n5. echo original MARK_ANSWER_TEXT\n6. echo checked MARK_CHECK\n' +
        'Then reply DONE.',
    }))
    .with('throw-load', () => ({
      mod: 'nixie-throw-load',
      prompt:
        'Run this shell command with the Bash tool, and do not retry or change it: ' +
        '`echo first MARK_DENY`. Then reply DONE.',
    }))
    .with('throw-hook-catch', () => ({
      mod: 'nixie-throw-hook-catch',
      prompt:
        'Run this shell command with the Bash tool, and do not retry or change it: ' +
        '`echo first MARK_NONE`. Then reply DONE.',
    }))
    .with('busy-loop', () => ({
      mod: 'nixie-busy-loop',
      prompt:
        'Run these two shell commands with the Bash tool, one tool call each, one after the other, ' +
        'and do not retry or change them: `echo first MARK_BLOCK`, then `echo second MARK_DENY`. ' +
        'Then reply DONE.',
    }))
    .exhaustive();
}
