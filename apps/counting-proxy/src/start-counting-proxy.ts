import type { Logger } from '@heynixie/logger';
import { toErrorFields } from '@heynixie/logger';
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

  // resolves when a stop has waited long enough for the replies under way, and closes their
  // connections
  readonly waitForDrainDeadline: () => Promise<void>;
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
      // Bun's graceful stop refuses new connections and waits for each streamed reply to end, so
      // the spend of a call under way reaches the count before the process exits
      const drained = server.stop();

      await Promise.race([drained, options.waitForDrainDeadline()]);

      // a reply still open at the deadline is cut off before its whole usage arrives, so the store
      // keeps the count's mark as lost for the next start to refuse
      if (server.pendingRequests > 0) {
        options.log('count.cut_off', { replies: server.pendingRequests }, 'error');

        await store.markLost().catch((error: unknown) => {
          options.log('counter.mark_failed', toErrorFields(error), 'error');
        });
      }

      await server.stop(true);
      await store.settle();
    },
  };
}
