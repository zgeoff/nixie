import type { ApprovalRead } from '../types';

interface ReadFacts {
  readonly proposals: readonly Pick<ApprovalRead, 'call'>[];
}

// A row that left the list reads again on this interval while its call waits to run, so its card
// follows the call to its outcome. It returns false once no row waits.
export function pickReadRefetchInterval(
  data: ReadFacts | undefined,
  intervalMs: number,
): number | false {
  const isWaiting = data?.proposals.some((read) => read.call?.state === 'waiting') ?? false;

  return isWaiting ? intervalMs : false;
}
