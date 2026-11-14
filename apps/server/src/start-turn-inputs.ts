import type { TurnInputs } from '@heynixie/turn-inputs';
import { createTurnInputs } from '@heynixie/turn-inputs';
import { buildOwnValueSearch } from './build-own-value-search';
import type { ServerPartValues } from './server-part-values';
import type { PartReader } from './types';

// Opens no capture while the deployment has no turn_input_log section. The start repairs what a
// stop left behind, and the intake and sweep run until the work stops.
export async function startTurnInputs(reader: PartReader<ServerPartValues>): Promise<TurnInputs> {
  const options = reader.get('inputs').options;
  const context = reader.get('context').apiContext;

  const turnInputs = createTurnInputs({
    log: context.log,
    clock: context.clock,
    definitions: context.definitions,
    logger: options.log,
    config: options.config.turn_input_log ?? null,
    holdsOwnValue: buildOwnValueSearch(options.secrets.ownValues),
  });

  await turnInputs.runStart();

  const work = turnInputs.startWork();

  await options.cleanup.defer(() => work.stop());

  return turnInputs;
}
