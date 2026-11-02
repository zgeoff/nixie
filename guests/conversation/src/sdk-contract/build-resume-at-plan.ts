import { match } from 'ts-pattern';
import { buildFiller } from './build-filler';

export type ResumeAtScenario = 'later-turn' | 'aborted-turn' | 'compacted-turn';

export interface ResumeAtPlan {
  readonly prompts: readonly [string, ...string[]];
  readonly isLastTurnAborted: boolean;
  readonly boundaryTurn: number;
}

export function buildResumeAtPlan(scenario: ResumeAtScenario): ResumeAtPlan {
  return match(scenario)
    .returnType<ResumeAtPlan>()
    .with('later-turn', () => ({
      prompts: [
        'The code word is APPLE. Reply with OK only.',
        'The code word is now BANANA. Reply with OK only.',
      ],
      isLastTurnAborted: false,
      boundaryTurn: 1,
    }))
    .with('aborted-turn', () => ({
      prompts: [
        'The code word is APPLE. Reply with OK only.',
        'The code word is now CHERRY. Write a 300-word story that uses it, then confirm.',
      ],
      isLastTurnAborted: true,
      boundaryTurn: 1,
    }))
    .with('compacted-turn', () => ({
      prompts: [
        `The code word is APPLE. Keep these tide notes for later.\n${buildFiller(12_000, 'part 1')}\nReply with OK only.`,
        `The code word is now BANANA. More tide notes.\n${buildFiller(12_000, 'part 2')}\nReply with OK only.`,
        'The code word is now CHERRY. Reply with OK only.',
        '/compact',
      ],
      isLastTurnAborted: false,
      boundaryTurn: 2,
    }))
    .exhaustive();
}
