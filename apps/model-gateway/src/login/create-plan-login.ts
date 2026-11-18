import type { Logger } from '@heynixie/logger';
import { toErrorFields } from '@heynixie/logger';
import type { PlanLoginConfig } from '../types';
import { changeLoginFile } from './change-login-file';
import type { AuthFetch } from './chatgpt-auth';
import { parseTokenExpiry } from './parse-token-expiry';
import { pickLoginAfterRefresh } from './pick-login-after-refresh';
import { readLoginFile } from './read-login-file';
import { requestTokenRefresh } from './request-token-refresh';

export interface LoginEntry {
  readonly status: 'active' | 'failing' | 'needs_login';
  readonly reason: 'refused' | 'service_error' | 'no_answer' | null;
  readonly since: string | null;
  readonly accountID: string | null;
  readonly planType: string | null;
}

export type PlanAdmit =
  | { readonly kind: 'ok'; readonly accessToken: string; readonly loginID: string }
  | { readonly kind: 'refused'; readonly message: string };

export interface PlanLogin {
  // the value of the route key file, which an `Authorization` header must carry
  readonly routeKey: string;

  // the access token for one request, after a refresh the token needs
  readonly admit: () => Promise<PlanAdmit>;

  // starts a refresh after the upstream refused the token of this login, once the token is old
  readonly refreshAfterRejection: (loginID: string) => Promise<void>;
  readonly readEntry: () => Promise<LoginEntry>;

  // refreshes now, then when the access token nears its expiry
  readonly start: () => void;
  readonly stop: () => Promise<void>;
}

export interface PlanLoginDeps {
  readonly routeID: string;
  readonly config: PlanLoginConfig;
  readonly send: AuthFetch;
  readonly now: () => number;

  // resolves after the time, or at once when the signal aborts
  readonly sleep: (delayMs: number, signal: AbortSignal) => Promise<void>;
  readonly log: Logger;
}

// the access token, which lives only here
interface HeldToken {
  readonly loginID: string;
  readonly accessToken: string;
  readonly gotAtMs: number;
  readonly expiresAtMs: number;

  // when the next refresh is due
  readonly dueAtMs: number;
}

interface PlanLoginState {
  held: HeldToken | null;
  inFlight: Promise<void> | null;
  failures: number;
  loop: Promise<void> | null;
}

const minuteMs = 60_000;

// a refresh after an upstream 401 runs only when the token is at least this old
const rejectionAgeMs = 5 * minuteMs;

export async function createPlanLogin(deps: PlanLoginDeps): Promise<PlanLogin> {
  const keyText = await Bun.file(deps.config.routeKeyFile).text();

  const routeKey = keyText.trim();

  if (routeKey === '') {
    throw new Error(`the route key file of ${deps.routeID} holds no key`);
  }

  const state: PlanLoginState = { held: null, inFlight: null, failures: 0, loop: null };

  const abort = new AbortController();

  const runRefresh = async (): Promise<void> => {
    const file = await readLoginFile(deps.config.file);

    if (file === null) {
      state.held = null;

      return;
    }

    if (file.status === 'needs_login') {
      return;
    }

    const answer = await requestTokenRefresh(deps.send, file.refreshToken);

    deps.log('login.refreshed', { route: deps.routeID, answer: answer.kind });

    const nowMs = deps.now();

    const nowIso = new Date(nowMs).toISOString();

    const outcome = pickLoginAfterRefresh(file, answer, state.failures, nowIso);

    state.failures = outcome.failures;

    // the rotated refresh token reaches the file before the new access token is used
    const login = outcome.login;

    const change =
      login === null ? null : await changeLoginFile(deps.config.file, file.loginID, () => login);

    if (answer.kind === 'refused') {
      state.held = null;
    }

    if (answer.kind !== 'token') {
      return;
    }

    state.held =
      change === 'replaced' || change === 'missing'
        ? null
        : buildHeldToken(file.loginID, answer.accessToken, nowMs);
  };

  const logRefreshFailure = (error: unknown): void => {
    deps.log('login.refresh_failed', { route: deps.routeID, ...toErrorFields(error) }, 'error');
  };

  const runGuardedRefresh = async (): Promise<void> => {
    try {
      await runRefresh();
    } catch (error) {
      logRefreshFailure(error);
    } finally {
      state.inFlight = null;
    }
  };

  const refresh = (): Promise<void> => {
    state.inFlight ??= runGuardedRefresh();

    return state.inFlight;
  };

  const readFileOrNull = async (): Promise<Awaited<ReturnType<typeof readLoginFile>>> => {
    try {
      return await readLoginFile(deps.config.file);
    } catch (error) {
      deps.log('login.read_failed', { route: deps.routeID, ...toErrorFields(error) }, 'error');

      return null;
    }
  };

  const admit = async (): Promise<PlanAdmit> => {
    const file = await readFileOrNull();

    if (file === null) {
      state.held = null;

      return buildRefusal(deps.routeID, 'has no readable login');
    }

    if (state.held !== null && state.held.loginID !== file.loginID) {
      state.held = null;
    }

    if (file.status !== 'active') {
      return buildRefusal(deps.routeID, `has a login that is ${file.status}`);
    }

    if (state.held === null || deps.now() >= state.held.dueAtMs) {
      await refresh();
    }

    const held = state.held;

    if (held === null || held.loginID !== file.loginID || deps.now() >= held.expiresAtMs) {
      return buildRefusal(deps.routeID, 'could not refresh its login');
    }

    return { kind: 'ok', accessToken: held.accessToken, loginID: held.loginID };
  };

  const refreshAfterRejection = async (loginID: string): Promise<void> => {
    const held = state.held;

    if (held?.loginID === loginID && deps.now() - held.gotAtMs >= rejectionAgeMs) {
      await refresh();
    }
  };

  const readEntry = async (): Promise<LoginEntry> => {
    const file = await readFileOrNull();

    return file === null
      ? { status: 'needs_login', reason: null, since: null, accountID: null, planType: null }
      : {
          status: file.status,
          reason: file.reason,
          since: file.statusSince,
          accountID: file.accountID,
          planType: file.planType,
        };
  };

  const runLoop = async (): Promise<void> => {
    while (!abort.signal.aborted) {
      // a request may have refreshed since the loop slept
      if (state.held === null || deps.now() >= state.held.dueAtMs) {
        await refresh();
      }

      await deps.sleep(pickLoopDelayMs(state.held, state.failures, deps.now()), abort.signal);
    }
  };

  return {
    routeKey,
    admit,
    refreshAfterRejection,
    readEntry,
    start: () => {
      state.loop ??= runLoop();
    },
    stop: async () => {
      abort.abort();

      await state.loop;
    },
  };
}

// a refresh comes this long before the access token expires
const refreshLeadMs = 5 * minuteMs;

// a login refreshes at least this often, whatever its access token says
const refreshIntervalMs = 7 * 24 * 60 * minuteMs;

// the life of an access token that carries no readable exp
const unknownLifeMs = 60 * minuteMs;

function buildHeldToken(loginID: string, accessToken: string, nowMs: number): HeldToken {
  const expiresAtMs = parseTokenExpiry(accessToken) ?? nowMs + unknownLifeMs;

  return {
    loginID,
    accessToken,
    gotAtMs: nowMs,
    expiresAtMs,

    // a short-lived token never makes each request refresh
    dueAtMs: Math.max(
      Math.min(expiresAtMs - refreshLeadMs, nowMs + refreshIntervalMs),
      nowMs + minuteMs,
    ),
  };
}

function buildRefusal(routeID: string, reason: string): PlanAdmit {
  return {
    kind: 'refused',
    message: `the route ${routeID} ${reason}, so an operator runs model-gateway chatgpt-login for it`,
  };
}

const pollMs = minuteMs;
const backoffFirstMs = 30_000;
const backoffMaxMs = 15 * minuteMs;

function pickLoopDelayMs(held: HeldToken | null, failures: number, nowMs: number): number {
  if (failures > 0) {
    return Math.min(backoffFirstMs * 2 ** (failures - 1), backoffMaxMs);
  }

  return held === null ? pollMs : Math.max(held.dueAtMs - nowMs, 1000);
}
