import type { APIContext, ReadViewMemory, WatchSocketData } from '@heynixie/api';
import { createAPIApp, createWatchRoute } from '@heynixie/api';
import type { DefinitionsContext } from '@heynixie/definitions';
import type { Writer } from '@heynixie/log';
import type { Logger } from '@heynixie/logger';
import { Elysia } from 'elysia';
import type { DeploymentConfig } from '../deployment/deployment-config-schema';
import type { Tools } from '../part/tools';
import type { Cleanup } from '../types';
import type { APIGate } from '../utils/build-api-gate';
import type { StartState } from '../utils/build-start-state';
import { startServerHealth } from './start-server-health';

export interface HTTPServerOptions {
  readonly config: DeploymentConfig;
  readonly writer: Writer;
  readonly state: StartState;
  readonly tools: Tools;
  readonly apiContext: APIContext;
  readonly cleanup: Cleanup;
  readonly log: Logger;

  readonly readMemory: ReadViewMemory;

  readonly runInForceSeed: () => Promise<void>;

  // null before the server parts start
  readonly readDefinitions: () => DefinitionsContext | null;

  readonly gate: APIGate;
}

export async function startHTTPServer(options: HTTPServerOptions): Promise<number> {
  const health = await startServerHealth({
    writer: options.writer,
    state: options.state,
    adapter: options.tools.adapter,
    dataDir: options.config.server.dataDir,
    clock: options.apiContext.clock,
    cleanup: options.cleanup,
    log: options.log,
  });

  const app = new Elysia()
    .use(health)
    .use(
      createAPIApp(
        options.apiContext,
        options.readMemory,
        options.runInForceSeed,
        options.readDefinitions,
      ),
    );

  const watchRoute = createWatchRoute(options.apiContext);

  // A watch socket upgrades inside the gate, and the gate lets go when the upgrade ends, so an open
  // socket never holds up a reset.
  const answerRequest = (
    request: Request,
    server: Bun.Server<WatchSocketData>,
  ): Promise<Response | undefined> => {
    if (watchRoute.isWatchRequest(request)) {
      return options.gate.runCall(
        () => watchRoute.upgrade(request, server),
        () => Promise.resolve(new Response('nixie is resetting', { status: 503 })),
      );
    }

    return options.gate.run(request, (passed) => app.handle(passed));
  };

  const http = Bun.serve<WatchSocketData>({
    hostname: options.config.server.hostname,
    port: options.config.server.port,
    fetch: answerRequest,
    websocket: watchRoute.websocket,
  });

  await options.cleanup.defer(() => http.stop(true));

  return http.port ?? options.config.server.port;
}
