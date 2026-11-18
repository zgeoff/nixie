import type {
  AboveCap,
  Done,
  GatewayStatus,
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
import { periodEndedSchema } from './period-ended-schema';
import { sandboxCountSchema } from './sandbox-count-schema';

export interface SpendGatewayOptions {
  // the origin of the gateway's control listener
  readonly url: string;
  readonly token: string;
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
      const response = await fetch(`${origin}${path}`, {
        method,
        headers: {
          authorization: `Bearer ${options.token}`,
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        },
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
    putLimits: async (limits) => {
      const answer = await send('PUT', '/limits', limits);

      return parseAboveCap(answer) ?? parseStatusAnswer(answer);
    },
    postRaise: async (raise) => {
      const answer = await send('POST', '/raise', {
        period: 'day',
        start: raise.start,
        limit: raise.limit,
      });

      if (isPeriodEnded(answer)) {
        return { kind: 'period_ended' };
      }

      return parseAboveCap(answer) ?? parseStatusAnswer(answer);
    },
    putSandbox: async (name, limit) => {
      const answer = await send('PUT', `/sandboxes/${encodeURIComponent(name)}`, { limit });

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

function parseAboveCap(answer: Answer | Unreachable): AboveCap | null {
  if (isUnreachable(answer) || answer.status !== 409) {
    return null;
  }

  const parsed = aboveCapSchema.safeParse(answer.body);

  if (!parsed.success) {
    return null;
  }

  const cap = parsed.data.cap;

  return {
    kind: 'above_cap',
    period: parsed.data.period ?? null,
    cap: { dollars: cap.dollars, tokens: cap.tokens },
  };
}

function isPeriodEnded(answer: Answer | Unreachable): boolean {
  return (
    !isUnreachable(answer) &&
    answer.status === 409 &&
    periodEndedSchema.safeParse(answer.body).success
  );
}

function parseNoContent(answer: Answer | Unreachable): Done | Unreachable {
  if (isUnreachable(answer)) {
    return answer;
  }

  return answer.status === 204 ? { kind: 'ok' } : renderRefusal(answer);
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
