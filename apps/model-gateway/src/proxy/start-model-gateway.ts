import type { Logger } from '@heynixie/logger';
import { toErrorFields } from '@heynixie/logger';
import invariant from 'tiny-invariant';
import type { ControlHandlerDeps } from '../control/make-control-handler';
import { makeControlHandler } from '../control/make-control-handler';
import { makeOverrideReader } from '../override/make-override-reader';
import { createPeriodStore } from '../periods/create-period-store';
import type { CounterStore, PeriodsConfig, ProxyConfig, ProxyLimits } from '../types';
import { createCaptureSpool } from '../usage/create-capture-spool';
import { createCounterStore } from '../usage/create-counter-store';
import { loadProxyConfig } from './load-proxy-config';
import type { PeriodsAccountingDeps } from './make-periods-accounting';
import { makeProxyHandler } from './make-proxy-handler';

export interface ModelGateway {
  readonly url: string;

  // the control listener's origin, null for a limits config
  readonly controlURL: string | null;
  readonly stop: () => Promise<void>;
}

export interface ModelGatewayOptions {
  readonly configPath: string;
  readonly log: Logger;

  // the clock the periods reset by, which a caller passes only to move time
  readonly now?: () => number;

  // resolves when a stop has waited long enough for the replies under way, and closes their
  // connections
  readonly waitForDrainDeadline: () => Promise<void>;
}

export async function startModelGateway(options: ModelGatewayOptions): Promise<ModelGateway> {
  const config = await loadProxyConfig(options.configPath);

  const now = options.now ?? Date.now;

  const counting =
    config.periods === null
      ? await startLimitsCounting(config)
      : await startPeriodsCounting(config, config.periods, now, options.log);

  const capture =
    config.capture === null
      ? null
      : await createCaptureSpool({ config: config.capture, log: options.log });

  const answerRequest = makeProxyHandler({
    routes: config.routes,
    ...counting.deps,
    capture,
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

  const answerControl = counting.control === null ? null : makeControlHandler(counting.control);

  const control =
    answerControl === null || counting.controlListen === null
      ? null
      : Bun.serve({
          hostname: counting.controlListen.hostname,
          port: counting.controlListen.port,
          fetch: answerControl,
        });

  options.log('proxy.started', {
    port: server.port ?? config.listen.port,
    routes: Object.keys(config.routes).join(','),
    capture: capture !== null,
    periods: config.periods !== null,
  });

  return {
    url: `http://${config.listen.hostname}:${String(server.port)}`,
    controlURL: control === null ? null : `http://${control.hostname}:${String(control.port)}`,
    stop: async () => {
      // Bun's graceful stop refuses new connections and waits for each streamed reply to end, so
      // the spend of a call under way reaches the count before the process exits
      const drained = server.stop();

      // the control listener drains the same way, so a limits, raise or sandbox reply under way
      // reaches its caller before the process exits
      const controlDrained = control?.stop();

      await Promise.race([Promise.all([drained, controlDrained]), options.waitForDrainDeadline()]);

      // a reply still open at the deadline is cut off before its whole usage arrives, so the store
      // keeps the count's mark as lost for the next start to refuse
      if (server.pendingRequests > 0) {
        options.log('count.cut_off', { replies: server.pendingRequests }, 'error');

        await counting.markLost().catch((error: unknown) => {
          options.log('counter.mark_failed', toErrorFields(error), 'error');
        });
      }

      await server.stop(true);
      await control?.stop(true);
      await capture?.settle();
      await counting.settle();
    },
  };
}

type CountingDeps =
  | { readonly limits: ProxyLimits; readonly store: CounterStore }
  | { readonly periods: PeriodsAccountingDeps };

interface Counting {
  readonly deps: CountingDeps;
  readonly control: ControlHandlerDeps | null;
  readonly controlListen: { readonly hostname: string; readonly port: number } | null;
  readonly markLost: () => Promise<void>;
  readonly settle: () => Promise<void>;
}

async function startLimitsCounting(config: ProxyConfig): Promise<Counting> {
  invariant(config.limits !== null, 'a config with no periods sets limits');

  const store = await createCounterStore(config.store);

  return {
    deps: { limits: config.limits, store },
    control: null,
    controlListen: null,
    markLost: store.markLost,
    settle: store.settle,
  };
}

async function startPeriodsCounting(
  config: ProxyConfig,
  periods: PeriodsConfig,
  now: () => number,
  log: Logger,
): Promise<Counting> {
  const store = await createPeriodStore({
    path: config.store,
    zone: periods.zone,
    now,
    readOverride: makeOverrideReader(periods.override, log),
    log,
  });

  const tokenText = await Bun.file(periods.control.tokenFile).text();

  const token = tokenText.trim();

  if (token === '') {
    throw new Error('the control token file holds no token');
  }

  return {
    deps: {
      periods: {
        store,
        countBySandbox: periods.countBySandbox,
        log,
      },
    },
    control: { store, config: periods, token, now, log },
    controlListen: periods.control.listen,
    markLost: store.markLost,
    settle: store.settle,
  };
}
