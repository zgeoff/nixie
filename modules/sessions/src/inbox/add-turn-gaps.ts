import type { TurnGaps } from '../types';

const openingTag = /^<(?:owner-message|system-message) [^\n]*>$/u;

// Puts the gaps on the opening tag of the element that starts a turn. Text that opens with no such
// tag, such as a task message, stays as it was.
export function addTurnGaps(text: string, gaps: TurnGaps): string {
  const [first = '', ...rest] = text.split('\n');

  if (!openingTag.test(first)) {
    return text;
  }

  const attributes = [
    ...(gaps.sinceYourLastTurn === null
      ? []
      : [` since-your-last-turn="${gaps.sinceYourLastTurn}"`]),
    ...(gaps.sinceOwnerLastWrote === null
      ? []
      : [` since-owner-last-wrote="${gaps.sinceOwnerLastWrote}"`]),
  ];

  return [`${first.slice(0, -1)}${attributes.join('')}>`, ...rest].join('\n');
}
