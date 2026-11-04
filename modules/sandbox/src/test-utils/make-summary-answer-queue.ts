import type { GuestFrame } from '@heynixie/wire';
import invariant from 'tiny-invariant';
import type { StubSummaryScript } from './start-stub-guest';

export function makeSummaryAnswerQueue(
  answers: readonly (readonly GuestFrame[])[],
): StubSummaryScript {
  const queue = [...answers];

  return () => {
    const answer = queue.shift();

    invariant(answer, 'a summary call came after the last answer in the queue');

    return answer;
  };
}
