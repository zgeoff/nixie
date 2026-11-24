import type { ServerPartValues } from '../part/server-part-values';
import type { PartReader } from '../types';

// Repairs what a stop left behind and starts the intake and the sweep. It runs after the erasure
// catch-up, so no capture repair or intake reaches what an open forget deletes.
export async function startTurnInputWork(reader: PartReader<ServerPartValues>): Promise<void> {
  const turnInputs = reader.get('turn_inputs');

  await turnInputs.runStart();

  const work = turnInputs.startWork();

  await reader.get('inputs').options.cleanup.defer(() => work.stop());
}
