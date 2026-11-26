import { timingSafeEqual } from 'node:crypto';
import type { Logger } from '@heynixie/logger';
import { toErrorFields } from '@heynixie/logger';
import { z } from 'zod';
import type { PlanLogin } from '../login/create-plan-login';
import type { RouteLimitsByID } from '../periods/collect-trips';
import { isSandboxLimitReached } from '../periods/is-sandbox-limit-reached';
import { sandboxNameSchema } from '../periods/sandbox-name-schema';
import { toDollars } from '../periods/to-dollars';
import type { PeriodChange, PeriodStore, PeriodStoreHandle, PeriodsConfig } from '../types';
import { buildStatus } from './build-status';
import type { ControlOutcome } from './control-outcome';
import { pickRaiseChange } from './pick-raise-change';
import { pickSandboxLimitChange } from './pick-sandbox-limit-change';
import { pickSandboxRemoveChange } from './pick-sandbox-remove-change';
import { pickSandboxSetChange } from './pick-sandbox-set-change';

export interface ControlHandlerDeps {
  readonly store: PeriodStoreHandle;
  readonly config: PeriodsConfig;

  // the limits of each configured route
  readonly limits: RouteLimitsByID;

  // the plan login of each plan route, by route ID
  readonly logins: Readonly<Record<string, PlanLogin>>;

  // the one line of the token file
  readonly token: string;
  readonly now: () => number;
  readonly log: Logger;
}

const sandboxLimitBodySchema = z.strictObject({
  dollars: z.number().min(0),
  tokens: z.number().positive().exactOptional(),
});

const raiseBodySchema = z.strictObject({
  route: z.string().min(1),
  start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),
  dollars: z.number().positive(),
});

const sandboxBodySchema = z.strictObject({ limit: sandboxLimitBodySchema.nullable() });

export function makeControlHandler(
  deps: ControlHandlerDeps,
): (request: Request) => Promise<Response> {
  const answerStatus = async (): Promise<Response> => {
    const held = await deps.store.readInForce();

    return Response.json(buildStatus(held.store, deps.limits, held.overrides, deps.config));
  };

  const answerOutcome = (outcome: ControlOutcome): Promise<Response> => {
    if (outcome.kind === 'above_cap') {
      return Promise.resolve(
        Response.json(
          { error: 'above_cap', route: outcome.route, cap: outcome.cap },
          { status: 409 },
        ),
      );
    }

    if (outcome.kind === 'unknown_route') {
      return Promise.resolve(Response.json({ error: 'unknown_route' }, { status: 404 }));
    }

    if (outcome.kind === 'period_ended') {
      return Promise.resolve(Response.json({ error: 'period_ended' }, { status: 409 }));
    }

    return answerStatus();
  };

  const changeStore = (decide: (store: PeriodStore) => PeriodChange<ControlOutcome>) =>
    deps.store.change(decide);

  const answerRaise = async (request: Request): Promise<Response> => {
    const body = await readBody(request, raiseBodySchema);

    if (body.kind === 'invalid') {
      return renderInvalid(body.message);
    }

    const raise = body.data;

    const limits = Object.hasOwn(deps.limits, raise.route)
      ? (deps.limits[raise.route] ?? null)
      : null;

    const outcome = await changeStore((store) => pickRaiseChange(store, limits, raise));

    return answerOutcome(outcome);
  };

  const answerSandboxRead = async (name: string): Promise<Response> => {
    const store = await deps.store.read();

    if (!Object.hasOwn(store.sandboxes, name)) {
      return Response.json({ error: 'not_found' }, { status: 404 });
    }

    const held = store.sandboxes[name];

    return Response.json({
      dollars: toDollars(held?.micros ?? 0),
      tokens: held?.tokens ?? 0,
      tripped: held !== undefined && isSandboxLimitReached(held),
      lastRefusal: held?.lastRefusal ?? null,
    });
  };

  const answerSandbox = async (request: Request, rawName: string): Promise<Response> => {
    const name = sandboxNameSchema.safeParse(decodeSegment(rawName));

    if (!name.success) {
      return renderInvalid('the sandbox name is not a valid name');
    }

    if (request.method === 'PUT') {
      const body = await readBody(request, sandboxBodySchema);

      if (body.kind === 'invalid') {
        return renderInvalid(body.message);
      }

      await changeStore((store) => pickSandboxSetChange(store, name.data, body.data.limit));

      return new Response(null, { status: 204 });
    }

    if (request.method === 'PATCH') {
      const body = await readBody(request, sandboxBodySchema);

      if (body.kind === 'invalid') {
        return renderInvalid(body.message);
      }

      const outcome = await changeStore((store) =>
        pickSandboxLimitChange(store, name.data, body.data.limit),
      );

      return outcome.kind === 'unknown_sandbox'
        ? Response.json({ error: 'not_found' }, { status: 404 })
        : new Response(null, { status: 204 });
    }

    if (request.method === 'DELETE') {
      await changeStore((store) => pickSandboxRemoveChange(store, name.data));

      return new Response(null, { status: 204 });
    }

    return request.method === 'GET' ? answerSandboxRead(name.data) : renderMethodNotAllowed();
  };

  const answerLogins = async (): Promise<Response> => {
    const entries = await Promise.all(
      Object.entries(deps.logins).map(
        async ([routeID, login]) => [routeID, await login.readEntry()] as const,
      ),
    );

    return Response.json(Object.fromEntries(entries));
  };

  const answerRoute = (request: Request, pathname: string): Promise<Response> | Response => {
    if (pathname === '/status') {
      return request.method === 'GET' ? answerStatus() : renderMethodNotAllowed();
    }

    if (pathname === '/chatgpt-logins') {
      return request.method === 'GET' ? answerLogins() : renderMethodNotAllowed();
    }

    if (pathname === '/raise') {
      return request.method === 'POST' ? answerRaise(request) : renderMethodNotAllowed();
    }

    const sandbox = /^\/sandboxes\/(?<name>[^/]+)$/u.exec(pathname)?.groups?.['name'];

    return sandbox === undefined
      ? Response.json({ error: 'not_found' }, { status: 404 })
      : answerSandbox(request, sandbox);
  };

  const answerControl = async (request: Request): Promise<Response> => {
    if (!isAuthorized(request, deps.token)) {
      return Response.json({ error: 'unauthorized' }, { status: 401 });
    }

    try {
      return await answerRoute(request, new URL(request.url).pathname);
    } catch (error) {
      deps.log('control.failed', toErrorFields(error), 'error');

      return Response.json({ error: 'store_unavailable' }, { status: 503 });
    }
  };

  return answerControl;
}

type BodyRead<T> =
  | { readonly kind: 'valid'; readonly data: T }
  | { readonly kind: 'invalid'; readonly message: string };

async function readBody<T>(request: Request, schema: z.ZodType<T>): Promise<BodyRead<T>> {
  const text = await request.text();

  let json: unknown;

  try {
    json = JSON.parse(text);
  } catch {
    return { kind: 'invalid', message: 'the body is not JSON' };
  }

  const parsed = schema.safeParse(json);

  return parsed.success
    ? { kind: 'valid', data: parsed.data }
    : { kind: 'invalid', message: z.prettifyError(parsed.error) };
}

function renderInvalid(message: string): Response {
  return Response.json({ error: 'invalid_request', message }, { status: 400 });
}

function decodeSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

function renderMethodNotAllowed(): Response {
  return Response.json({ error: 'method_not_allowed' }, { status: 405 });
}

function isAuthorized(request: Request, token: string): boolean {
  const given = Buffer.from(request.headers.get('authorization') ?? '');
  const expected = Buffer.from(`Bearer ${token}`);

  return given.length === expected.length && timingSafeEqual(given, expected);
}
