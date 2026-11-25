import { webFetchDefaults } from '@heynixie/connectors';
import type { TurnInputs } from '@heynixie/turn-inputs';
import { createTurnInputs } from '@heynixie/turn-inputs';
import type { ServerPartValues } from '../part/server-part-values';
import type { PartReader } from '../types';
import { makeOwnValueSearch } from './make-own-value-search';

// Opens no capture while the deployment has no turn_input_log section. The repair and the work
// start later, in the part that follows the erasure catch-up.
export function startTurnInputs(reader: PartReader<ServerPartValues>): Promise<TurnInputs> {
  const options = reader.get('inputs').options;
  const context = reader.get('context').apiContext;

  return Promise.resolve(
    createTurnInputs({
      log: context.log,
      clock: context.clock,
      definitions: context.definitions,
      logger: options.log,
      config: options.config.turn_input_log ?? null,
      holdsOwnValue: makeOwnValueSearch(() =>
        options.secrets.ownValues.read({
          entries: webFetchDefaults.secretOwnValues,
          minChars: webFetchDefaults.secretOwnValueMinChars,
        }),
      ),
    }),
  );
}
