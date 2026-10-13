import { checkDatabaseIntegrity, toErrorFields } from '@heynixie/ops';
import { buildSeedInputs } from './build-seed-inputs';
import { buildServerContext } from './build-server-context';
import { buildStartState } from './build-start-state';
import { runStartSequence } from './run-start-sequence';
import { startHostCommands } from './start-host-commands';
import { startHTTPServer } from './start-http-server';
import type { Server, ServerPartsOptions } from './start-server';
import { startTools } from './start-tools';
import type { ServerParts } from './types';

// Starts the parts on the open database: the integrity check, the tools, the health endpoint with
// the API, and the control socket. The rest of the start runs in the background, behind the health
// endpoint.
export async function startServerParts(options: ServerPartsOptions): Promise<Server> {
  const database = await checkDatabaseIntegrity(options.writer.db);
  const state = buildStartState(database);
  const base = await buildServerContext(options.writer, options.secrets.deploymentKey);
  const tools = await startTools({
    ...options,
    context: base.apiContext,
    impdToken: options.secrets.impdToken,
  });
  const port = await startHTTPServer({ ...options, state, tools, apiContext: base.apiContext });

  options.log('http.listening', { port });
  await startHostCommands(
    { dataDir: options.config.server.dataDir, apiContext: base.apiContext, memory: tools.memory },
    options.cleanup,
  );

  const failed = Promise.withResolvers<unknown>();
  const ready = startInBackground({
    ...options,
    ...base,
    ...buildSeedInputs(options.config, tools.definitions),
    state,
    context: base.apiContext,
    tools,
    modelSecrets: options.secrets.models,
    onFailure: failed.resolve,
  });

  return { port, ready, failed: failed.promise, stop: makeStop(options, ready) };
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

// The stop ends the start sequence and waits for its step in flight, so no part closes under it.
function makeStop(options: ServerPartsOptions, ready: Promise<void>): Server['stop'] {
  return async () => {
    options.log('stopping');
    options.cleanup.abort();
    await waitForSettled(ready);
    await options.cleanup.stop();
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
