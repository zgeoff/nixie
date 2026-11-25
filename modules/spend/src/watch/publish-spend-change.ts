import { publishChanged } from '@heynixie/log';
import type { SpendFacts } from '../stop/pick-spend-stop';
import { pickSpendStop } from '../stop/pick-spend-stop';
import type { SpendContext } from '../types';

interface StopRead {
  lastStopKey: string | null;
}

// Names the spend topic when the stop that the facts show, which includes whether the gateway
// answers, differs from the one the last poll read. The first read has none to differ from.
export function publishSpendChange(
  context: SpendContext,
  state: StopRead,
  facts: SpendFacts,
): void {
  const stopKey = JSON.stringify(pickSpendStop(facts));
  const isChanged = state.lastStopKey !== null && state.lastStopKey !== stopKey;

  state.lastStopKey = stopKey;

  if (isChanged) {
    publishChanged(context.log.writer, ['spend']);
  }
}
