import type { Logger } from '@heynixie/logger';
import { createCounterStore } from './create-counter-store';
import { makeProxyHandler } from './make-proxy-handler';
import { proxyConfigSchema } from './proxy-config-schema';

export interface CountingProxy {
  readonly url: string;
  readonly stop: () => Promise<void>;
}

export interface CountingProxyOptions {
  readonly configPath: string;
  readonly log: Logger;
}

export async function startCountingProxy(options: CountingProxyOptions): Promise<CountingProxy> {
  const text = await Bun.file(options.configPath).text();

  const config = proxyConfigSchema.parse(Bun.YAML.parse(text));

  const store = await createCounterStore(config.store);

  const answerRequest = makeProxyHandler({
    routes: config.routes,
    limits: config.limits,
    store,
    sendUpstream: fetch,
    log: options.log,
  });

  const server = Bun.serve({
    hostname: config.listen.hostname,
    port: config.listen.port,

    // a streamed reply can sit quiet for longer than Bun's default idle timeout while the model
    // thinks
    idleTimeout: 0,
    fetch: answerRequest,
  });

  options.log('proxy.started', {
    port: server.port ?? config.listen.port,
    routes: Object.keys(config.routes).join(','),
  });

  return {
    url: `http://${config.listen.hostname}:${String(server.port)}`,
    stop: async () => {
      await server.stop(true);
    },
  };
}
