import { waitForSettled } from '@heynixie/async';
import { toErrorFields } from '@heynixie/logger';
import { buildCleanup } from './build-cleanup';
import { serverPartDeclarations } from './server-part-declarations';
import type { ServerPartValues } from './server-part-values';
import { startPartGraph } from './start-part-graph';
import type { Server, ServerPartsOptions } from './start-server';
import type { AnyPartDeclaration, Cleanup, PartGraph } from './types';

// Starts the server's parts in the order their declarations derive, and returns once the control
// socket opens. The parts behind it start in the background on a cleanup of their own, so a reset
// stops them and leaves the writer and the sockets.
export async function startServerWork(options: ServerPartsOptions): Promise<Server> {
  const failed = Promise.withResolvers<unknown>();
  const work = buildCleanup();

  const inputs: AnyPartDeclaration<ServerPartValues> = {
    name: 'inputs',
    needs: [],
    start: () => Promise.resolve({ options, work, onFailure: failed.resolve }),
  };

  const graph = startPartGraph<ServerPartValues>([inputs, ...serverPartDeclarations], {
    signal: work.signal,
  });

  const reset = await graph.waitFor('reset');

  await graph.waitFor('host_commands');
  await options.cleanup.defer(() => work.stop());

  void waitForStartFailure(graph, { work, options, onFailure: failed.resolve });

  return {
    port: await graph.waitFor('http'),
    ready: graph.done,
    failed: failed.promise,
    reset: reset.done,
    log: options.log,
    stop: makeStop(
      { cleanup: options.cleanup, work, waitForReset: reset.waitForSettled },
      options,
      graph,
    ),
  };
}

interface StartFailure {
  readonly work: Cleanup;
  readonly options: ServerPartsOptions;
  readonly onFailure: (error: unknown) => void;
}

// A part that fails outside the retries ends the server, so the container runtime restarts it
// instead of leaving it live with no runners. A stop that cuts the start short is no failure.
async function waitForStartFailure(
  graph: PartGraph<ServerPartValues>,
  failure: StartFailure,
): Promise<void> {
  try {
    await graph.done;
  } catch (error) {
    if (!failure.work.signal.aborted) {
      failure.options.log('start.failed', toErrorFields(error));
      failure.onFailure(error);
    }
  }
}

interface Stops {
  readonly cleanup: Cleanup;
  readonly work: Cleanup;
  readonly waitForReset: () => Promise<void>;
}

// The stop ends the start at its next part and waits for its part in flight, and for a reset in
// flight, so no part closes under either.
function makeStop(
  stops: Stops,
  options: ServerPartsOptions,
  graph: PartGraph<ServerPartValues>,
): Server['stop'] {
  return async () => {
    options.log('stopping');
    stops.cleanup.abort();
    stops.work.abort();

    // the start failure report reads the rejection
    await waitForSettled(graph.done);

    await stops.waitForReset();
    await stops.cleanup.stop();

    options.log('stopped');
  };
}
