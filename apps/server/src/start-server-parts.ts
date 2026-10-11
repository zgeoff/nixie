import { checkDatabaseIntegrity } from '@heynixie/ops';
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
  const state = buildStartState();

  state.database = await checkDatabaseIntegrity(options.writer.db);

  const base = await buildServerContext(options.writer, options.secrets.deploymentKey);
  const tools = await startTools({
    ...options,
    context: base.apiContext,
    impdToken: options.secrets.impdToken,
  });
  const port = await startHTTPServer({ ...options, state, tools, apiContext: base.apiContext });

  options.log('http.listening', { port });
  await startHostCommands(options.config.server.dataDir, base.apiContext, options.cleanup);

  const failed = Promise.withResolvers<unknown>();
  const ready = startInBackground({
    ...options,
    ...base,
    ...buildSeedInputs(options.config, [tools.webFetch.tool]),
    state,
    context: base.apiContext,
    tools,
    modelSecrets: options.secrets.models,
    onFailure: failed.resolve,
  });

  return { port, ready, failed: failed.promise, stop: makeStop(options) };
}

// A stop that cuts the start short rejects the start sequence, which a caller need not read.
function startInBackground(parts: ServerParts): Promise<void> {
  const ready = runStartSequence(parts);

  void waitForSettled(ready);
  return ready;
}

async function waitForSettled(ready: Promise<void>): Promise<void> {
  try {
    await ready;
  } catch {
    // the caller that reads ready sees the rejection
  }
}

function makeStop(options: ServerPartsOptions): Server['stop'] {
  return async () => {
    options.log('stopping');
    await options.cleanup.stop();
    options.log('stopped');
  };
}
