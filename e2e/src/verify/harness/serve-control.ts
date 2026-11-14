import type { z } from 'zod';
import type { ControlRoute } from './control-routes';
import { controlRoutes } from './control-routes';

export interface ControlHandlers {
  readonly isNixieRunning: () => boolean;

  readonly addReply: (reply: z.output<typeof controlRoutes.addReply.input>) => number;
}

export function serveControl(handlers: ControlHandlers): Bun.Server<undefined> {
  return Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    routes: {
      [controlRoutes.health.path]: {
        GET: makeRouteHandler(controlRoutes.health, () => ({
          isNixieRunning: handlers.isNixieRunning(),
        })),
      },
      [controlRoutes.addReply.path]: {
        POST: makeRouteHandler(controlRoutes.addReply, (reply) => ({
          replies: handlers.addReply(reply),
        })),
      },
    },
    fetch: answerUnknownPath,
  });
}

function makeRouteHandler<Input extends z.ZodType, Output extends z.ZodType>(
  route: ControlRoute<Input, Output>,
  answer: (input: z.output<Input>) => z.input<Output>,
) {
  return async (request: Request): Promise<Response> => {
    const body: unknown = route.method === 'GET' ? {} : await request.json().catch(() => null);
    const parsed = route.input.safeParse(body);

    if (!parsed.success) {
      return Response.json({ error: parsed.error.message }, { status: 400 });
    }

    return Response.json(route.output.parse(answer(parsed.data)));
  };
}

function answerUnknownPath(): Response {
  return new Response(null, { status: 404 });
}
