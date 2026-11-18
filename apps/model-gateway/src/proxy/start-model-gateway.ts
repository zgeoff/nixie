import { setTimeout as sleepFor } from 'node:timers/promises';
import type { Logger } from '@heynixie/logger';
import invariant from 'tiny-invariant';
import type { ControlHandlerDeps } from '../control/make-control-handler';
import { makeControlHandler } from '../control/make-control-handler';
import type { AuthFetch } from '../login/chatgpt-auth';
import type { PlanLogin } from '../login/create-plan-login';
import { createPlanLogin } from '../login/create-plan-login';
import { makeOverrideReader } from '../override/make-override-reader';
import { createPeriodStore } from '../periods/create-period-store';
import type { CounterStore, PeriodsConfig, ProxyConfig, ProxyLimits } from '../types';
import { createCaptureSpool } from '../usage/create-capture-spool';
import { createCounterStore } from '../usage/create-counter-store';
import { loadProxyConfig } from './load-proxy-config';
import { makeOpenReplies } from './make-open-replies';
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

  // the call that refreshes a plan login, which a caller passes only to answer it itself
  readonly authFetch?: AuthFetch;

  // waits for the refresh of a plan login, which a caller passes only to move time
  readonly sleep?: (delayMs: number, signal: AbortSignal) => Promise<void>;

  // resolves when a stop has waited long enough for the replies under way, and closes their
  // connections
  readonly waitForDrainDeadline: () => Promise<void>;
}

export async function startModelGateway(options: ModelGatewayOptions): Promise<ModelGateway> {
  const config = await loadProxyConfig(options.configPath);

  const now = options.now ?? Date.now;

  const logins = await createPlanLogins(config, {
    send: options.authFetch ?? fetch,
    now,
    sleep: options.sleep ?? waitUnlessAborted,
    log: options.log,
  });

  const counting =
    config.periods === null
      ? await startLimitsCounting(config)
      : await startPeriodsCounting(config, config.periods, { now, log: options.log, logins });

  const capture =
    config.capture === null
      ? null
      : await createCaptureSpool({ config: config.capture, log: options.log });

  const openReplies = makeOpenReplies();

  const answerRequest = makeProxyHandler({
    openReplies,
    routes: config.routes,
    planLogins: logins,
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

  for (const login of Object.values(logins)) {
    login.start();
  }

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

      // a reply still open at the deadline is cut off before its whole usage arrives, so each one
      // that spends is charged its estimate
      if (server.pendingRequests > 0) {
        options.log('count.cut_off', { replies: server.pendingRequests }, 'error');

        await openReplies.countAtStop();
      }

      await server.stop(true);
      await control?.stop(true);
      await Promise.all(Object.values(logins).map((login) => login.stop()));
      await capture?.settle();
      await counting.settle();
    },
  };
}

type PlanLoginsDeps = Omit<Parameters<typeof createPlanLogin>[0], 'routeID' | 'config'>;

async function createPlanLogins(
  config: ProxyConfig,
  deps: PlanLoginsDeps,
): Promise<Record<string, PlanLogin>> {
  const entries = await Promise.all(
    Object.entries(config.routes).map(async ([routeID, route]) => {
      if (route.login === null) {
        return null;
      }

      const login = await createPlanLogin({ ...deps, routeID, config: route.login });

      return [routeID, login] as const;
    }),
  );

  return Object.fromEntries(entries.filter((entry) => entry !== null));
}

async function waitUnlessAborted(delayMs: number, signal: AbortSignal): Promise<void> {
  try {
    await sleepFor(delayMs, undefined, { signal });
  } catch {
    // an abort ends the wait early, which is what the stop of the gateway asks for
  }
}

type CountingDeps =
  | { readonly limits: ProxyLimits; readonly store: CounterStore }
  | { readonly periods: PeriodsAccountingDeps };

interface Counting {
  readonly deps: CountingDeps;
  readonly control: ControlHandlerDeps | null;
  readonly controlListen: { readonly hostname: string; readonly port: number } | null;
  readonly settle: () => Promise<void>;
}

async function startLimitsCounting(config: ProxyConfig): Promise<Counting> {
  invariant(config.limits !== null, 'a config with no periods sets limits');

  const store = await createCounterStore(config.store);

  return {
    deps: { limits: config.limits, store },
    control: null,
    controlListen: null,
    settle: store.settle,
  };
}

interface PeriodsCountingDeps {
  readonly now: () => number;
  readonly log: Logger;
  readonly logins: Readonly<Record<string, PlanLogin>>;
}

async function startPeriodsCounting(
  config: ProxyConfig,
  periods: PeriodsConfig,
  deps: PeriodsCountingDeps,
): Promise<Counting> {
  const store = await createPeriodStore({
    path: config.store,
    zone: periods.zone,
    now: deps.now,
    readOverride: makeOverrideReader(periods.override, deps.log),
    log: deps.log,
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
        log: deps.log,
      },
    },
    control: {
      store,
      config: periods,
      logins: deps.logins,
      token,
      now: deps.now,
      log: deps.log,
    },
    controlListen: periods.control.listen,
    settle: store.settle,
  };
}
