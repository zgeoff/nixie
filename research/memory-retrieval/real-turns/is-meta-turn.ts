import type { TurnCase } from './build-turn-cases.ts';

// A turn that talks about retrieval itself, such as the memories it was just shown, makes every
// shown item helpful as an example rather than as memory, so its labels measure nothing.
const metaPattern = /(?<!golden )\bretriev\w*|\bpaste problem\b|\bmemory (?:issues?|batch|blocks?)\b|\bspammed\b/iu;

export function isMetaTurn(turn: Pick<TurnCase, 'query' | 'reply'>): boolean {
  return metaPattern.test(`${turn.query}\n${turn.reply}`);
}
