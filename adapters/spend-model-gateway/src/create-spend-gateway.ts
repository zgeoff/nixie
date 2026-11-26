import type {
  AboveCap,
  Done,
  GatewayStatus,
  NoRouteLimit,
  NotFound,
  PlanLoginStatus,
  SandboxCount,
  SpendGateway,
  Unreachable,
} from '@heynixie/spend';
import type { z } from 'zod';
import { aboveCapSchema } from './above-cap-schema';
import { chatgptLoginsSchema } from './chatgpt-logins-schema';
import { gatewayStatusSchema } from './gateway-status-schema';
import { noRouteLimitSchema } from './no-route-limit-schema';
import { periodEndedSchema } from './period-ended-schema';
import { revisionChangedSchema } from './revision-changed-schema';
import { sandboxCountSchema } from './sandbox-count-schema';

export interface SpendGatewayOptions {
  // the origin of the gateway's control listener
  readonly url: string;

  // adds the control token on the host, so the adapter holds none
  readonly fetch: (input: string, init?: RequestInit) => Promise<Response>;
  readonly timeoutMs?: number;
}

interface Answer {
  readonly status: number;
  readonly body: unknown;
}

const defaultTimeoutMs = 5000;

export function createSpendGateway(options: SpendGatewayOptions): SpendGateway {
  const origin = options.url.replace(/\/+$/u, '');

  const send = async (
    method: string,
    path: string,
    body?: unknown,
  ): Promise<Answer | Unreachable> => {
    try {
      const response = await options.fetch(`${origin}${path}`, {
        method,
        headers: body === undefined ? {} : { 'content-type': 'application/json' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(options.timeoutMs ?? defaultTimeoutMs),
      });

      return { status: response.status, body: await readBody(response) };
    } catch (error) {
      return {
        kind: 'unreachable',
        reason: error instanceof Error ? error.message : String(error),
      };
    }
  };

  return {
    readStatus: async () => {
      const answer = await send('GET', '/status');

      return parseStatusAnswer(answer);
    },
    readChatGPTLogins: async () => {
      const answer = await send('GET', '/chatgpt-logins');

      return parseLoginsAnswer(answer);
    },
    postRaise: async (raise) => {
      const answer = await send('POST', '/raise', {
        [raise.target.kind]: raise.target.id,
        start: raise.start,
        dollars: raise.dollars,
      });

      if (isPeriodEnded(answer)) {
        return { kind: 'period_ended' };
      }

      if (!isUnreachable(answer) && answer.status === 404) {
        return { kind: 'not_found' };
      }

      return parseNoRouteLimit(answer) ?? parseAboveCap(answer) ?? parseStatusAnswer(answer);
    },
    postCount: async (change) => {
      const answer = await send('POST', '/count', {
        [change.target.kind]: change.target.id,
        period: change.period,
        start: change.start,
        dollars: change.dollars,
      });

      if (isPeriodEnded(answer)) {
        return { kind: 'period_ended' };
      }

      if (!isUnreachable(answer) && answer.status === 404) {
        return { kind: 'not_found' };
      }

      return parseNoContent(answer);
    },
    putSandbox: async (name, limit) => {
      const answer = await send('PUT', `/sandboxes/${encodeURIComponent(name)}`, { limit });

      return parseNoContent(answer);
    },
    patchSandbox: async (name, limit, revision) => {
      const answer = await send('PATCH', `/sandboxes/${encodeURIComponent(name)}`, {
        limit,
        ...(revision === undefined ? {} : { revision }),
      });

      if (!isUnreachable(answer) && answer.status === 404) {
        return { kind: 'not_found' };
      }

      if (isRevisionChanged(answer)) {
        return { kind: 'revision_changed' };
      }

      return parseNoContent(answer);
    },
    readSandbox: async (name) => {
      const answer = await send('GET', `/sandboxes/${encodeURIComponent(name)}`);

      return parseSandboxAnswer(answer);
    },
    removeSandbox: async (name) => {
      const answer = await send('DELETE', `/sandboxes/${encodeURIComponent(name)}`);

      return parseNoContent(answer);
    },
  };
}

async function readBody(response: Response): Promise<unknown> {
  const text = await response.text();

  try {
    return text === '' ? null : JSON.parse(text);
  } catch {
    return null;
  }
}

function parseStatusAnswer(answer: Answer | Unreachable): Done<GatewayStatus> | Unreachable {
  const parsed = parseBody(answer, gatewayStatusSchema);

  return parsed.kind === 'ok' ? { kind: 'ok', value: parsed.value } : parsed;
}

type Parsed<Value> = { readonly kind: 'ok'; readonly value: Value } | Unreachable;

function parseBody<Value>(answer: Answer | Unreachable, schema: z.ZodType<Value>): Parsed<Value> {
  if (isUnreachable(answer)) {
    return answer;
  }

  if (answer.status !== 200) {
    return renderRefusal(answer);
  }

  const parsed = schema.safeParse(answer.body);

  return parsed.success
    ? { kind: 'ok', value: parsed.data }
    : { kind: 'unreachable', reason: 'the gateway sent a reply that is not its own' };
}

function isUnreachable(answer: Answer | Unreachable): answer is Unreachable {
  return 'kind' in answer;
}

function renderRefusal(answer: Answer): Unreachable {
  return { kind: 'unreachable', reason: `the gateway answered ${String(answer.status)}` };
}

function parseLoginsAnswer(
  answer: Answer | Unreachable,
): Done<Readonly<Record<string, PlanLoginStatus>>> | Unreachable {
  const parsed = parseBody(answer, chatgptLoginsSchema);

  if (parsed.kind !== 'ok') {
    return parsed;
  }

  const routes = Object.fromEntries(
    Object.entries(parsed.value).map(([routeID, login]) => [
      routeID,
      { status: login.status, accountID: login.accountID, planType: login.planType },
    ]),
  );

  return { kind: 'ok', value: routes };
}

function isPeriodEnded(answer: Answer | Unreachable): boolean {
  return (
    !isUnreachable(answer) &&
    answer.status === 409 &&
    periodEndedSchema.safeParse(answer.body).success
  );
}

function parseNoRouteLimit(answer: Answer | Unreachable): NoRouteLimit | null {
  if (isUnreachable(answer) || answer.status !== 409) {
    return null;
  }

  const parsed = noRouteLimitSchema.safeParse(answer.body);

  return parsed.success ? { kind: 'no_route_limit', route: parsed.data.route } : null;
}

function parseAboveCap(answer: Answer | Unreachable): AboveCap | null {
  if (isUnreachable(answer) || answer.status !== 409) {
    return null;
  }

  const parsed = aboveCapSchema.safeParse(answer.body);

  if (!parsed.success) {
    return null;
  }

  return {
    kind: 'above_cap',
    route: parsed.data.route,
    provider: parsed.data.provider,
    cap: parsed.data.cap,
  };
}

function parseNoContent(answer: Answer | Unreachable): Done | Unreachable {
  if (isUnreachable(answer)) {
    return answer;
  }

  return answer.status === 204 ? { kind: 'ok' } : renderRefusal(answer);
}

function isRevisionChanged(answer: Answer | Unreachable): boolean {
  return (
    !isUnreachable(answer) &&
    answer.status === 409 &&
    revisionChangedSchema.safeParse(answer.body).success
  );
}

function parseSandboxAnswer(
  answer: Answer | Unreachable,
): Done<SandboxCount> | NotFound | Unreachable {
  if (!isUnreachable(answer) && answer.status === 404) {
    return { kind: 'not_found' };
  }

  const parsed = parseBody(answer, sandboxCountSchema);

  return parsed.kind === 'ok' ? { kind: 'ok', value: parsed.value } : parsed;
}
