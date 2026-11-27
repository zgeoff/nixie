import { startSweep } from '@heynixie/clock';
import type { DatabaseHeldBackend } from '@heynixie/connections';
import { createDatabaseHeldBackend } from '@heynixie/connections';
import { createCredentialRecorder } from '@heynixie/credentials';
import { toErrorFields } from '@heynixie/logger';
import type { ServerParts } from '../types';

const sweepIntervalMs = 60 * 60 * 1000;

// Starts the credential store's database backend, which each connector and the MCP proxy keep their
// credentials in. Each start closes the refreshes a crash lost and sweeps the keys that no
// credential names, and an hourly pass sweeps them again.
export async function startHeldCredentialsPart(parts: ServerParts): Promise<DatabaseHeldBackend> {
  const log = parts.context.log;
  const definitions = parts.context.definitions;
  const now = () => parts.context.clock.now();

  const wiring = parts.heldSlot.bind(() => {
    const recorder = createCredentialRecorder({ log, definitions });

    return { backend: createDatabaseHeldBackend({ log, definitions, recorder, now }), recorder };
  });

  await parts.credentials.store.recover();
  await wiring.backend.sweepKeys();

  const sweep = startSweep({
    clock: parts.context.clock,
    intervalMs: sweepIntervalMs,
    run: () => wiring.backend.sweepKeys(),
    onError: (error) => {
      parts.log('connections.key_sweep_failed', toErrorFields(error), 'warn');
    },
  });

  await parts.cleanup.defer(() => sweep.stop());

  return wiring.backend;
}
