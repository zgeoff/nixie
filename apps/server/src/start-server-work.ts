import { toErrorFields } from '@heynixie/ops';
import { buildCleanup } from './build-cleanup';
import { buildSeedInputs } from './build-seed-inputs';
import type { ServerResetControl } from './build-server-reset';
import { buildServerReset } from './build-server-reset';
import { runStartSequence } from './run-start-sequence';
import { startHostCommands } from './start-host-commands';
import type { Server, ServerPartsOptions } from './start-server';
import type { Cleanup, ServerBase, ServerParts } from './types';

// Opens the control socket, then runs the rest of the start in the background. The start registers
// its parts on a cleanup of its own, so a reset stops them and leaves the writer and the sockets.
export async function startServerWork(
  options: ServerPartsOptions,
  base: ServerBase,
): Promise<Server> {
  const failed = Promise.withResolvers<unknown>();
  const work = buildCleanup();
  const start: { ready: Promise<void> } = { ready: Promise.resolve() };

  const reset = buildServerReset({
    context: base.apiContext,
    adapter: base.tools.adapter,
    work,
    closeAPI: base.closeAPI,
    readStart: () => start.ready,
    log: options.log,
    onFailure: failed.resolve,
  });

  await startHostCommands(
    {
      dataDir: options.config.server.dataDir,
      apiContext: base.apiContext,
      memory: base.tools.memory,
      runReset: reset.run,
    },
    options.cleanup,
  );

  await options.cleanup.defer(() => work.stop());

  start.ready = startInBackground({
    ...options,
    ...base,
    ...buildSeedInputs(options.config, base.tools.definitions),
    context: base.apiContext,
    cleanup: work,
    modelSecrets: options.secrets.models,
    onFailure: failed.resolve,
  });

  return {
    port: base.port,
    ready: start.ready,
    failed: failed.promise,
    reset: reset.done,
    log: options.log,
    stop: makeStop({ cleanup: options.cleanup, work, reset }, options, start.ready),
  };
}

// A step that fails outside the retries ends the server, so the container runtime restarts it
// instead of leaving it live with no runners. A stop that cuts the start short is no failure.
function startInBackground(parts: ServerParts): Promise<void> {
  const ready = runStartSequence(parts);

  void waitForStartFailure(ready, parts);

  return ready;
}

async function waitForStartFailure(ready: Promise<void>, parts: ServerParts): Promise<void> {
  try {
    await ready;
  } catch (error) {
    if (!parts.cleanup.signal.aborted) {
      parts.log('start.failed', toErrorFields(error));
      parts.onFailure(error);
    }
  }
}

interface Stops {
  readonly cleanup: Cleanup;
  readonly work: Cleanup;
  readonly reset: ServerResetControl;
}

// The stop ends the start sequence and waits for its step in flight, and for a reset in flight, so
// no part closes under either.
function makeStop(stops: Stops, options: ServerPartsOptions, ready: Promise<void>): Server['stop'] {
  return async () => {
    options.log('stopping');
    stops.cleanup.abort();
    stops.work.abort();

    await waitForSettled(ready);

    await stops.reset.waitForSettled();
    await stops.cleanup.stop();

    options.log('stopped');
  };
}

async function waitForSettled(ready: Promise<void>): Promise<void> {
  try {
    await ready;
  } catch {
    // the start failure report reads the rejection
  }
}
