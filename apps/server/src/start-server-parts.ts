import { checkDatabaseIntegrity } from '@heynixie/ops';
import { buildAPIGate } from './build-api-gate';
import { buildServerContext } from './build-server-context';
import { buildStartState } from './build-start-state';
import { startHTTPServer } from './start-http-server';
import type { Server, ServerPartsOptions } from './start-server';
import { startServerWork } from './start-server-work';
import { startTools } from './start-tools';

// Starts the parts on the open database: the integrity check, the tools, the health endpoint with
// the API, then the control socket and the start sequence behind the health endpoint.
export async function startServerParts(options: ServerPartsOptions): Promise<Server> {
  const database = await checkDatabaseIntegrity(options.writer.db);
  const state = buildStartState(database);
  const base = await buildServerContext(options.writer, options.secrets.deploymentKey);
  const tools = await startTools({
    ...options,
    context: base.apiContext,
    impdToken: options.secrets.impdToken,
  });
  const gate = buildAPIGate();
  const port = await startHTTPServer({
    ...options,
    state,
    tools,
    apiContext: base.apiContext,
    gate,
  });

  options.log('http.listening', { port });
  return startServerWork(options, { ...base, state, tools, port, closeAPI: gate.close });
}
