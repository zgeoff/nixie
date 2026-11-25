import type { z } from 'zod';
import type { ControlRoute } from './control-routes';
import { controlRoutes } from './control-routes';

export interface ControlHandlers {
  readonly isNixieRunning: () => boolean;

  readonly addReply: (reply: z.output<typeof controlRoutes.addReply.input>) => number;

  readonly showOnDevice: (
    show: z.output<typeof controlRoutes.showOnDevice.input>,
  ) => Promise<number>;

  readonly layoutOnDevice: (
    layout: z.output<typeof controlRoutes.layoutOnDevice.input>,
  ) => Promise<number>;

  readonly advanceClock: (minutes: number) => Promise<number>;

  readonly useComputer: (use: z.output<typeof controlRoutes.useComputer.input>) => Promise<number>;

  // how many requests of the scripted model hold the text, after waiting for one to come
  readonly countModelRequests: (text: string) => Promise<number>;

  // sends one model request to the route of the spending gateway, and reports its answer
  readonly probeRoute: (route: string) => Promise<z.input<typeof controlRoutes.probeRoute.output>>;

  readonly readTasks: () => Promise<z.input<typeof controlRoutes.tasks.output>>;

  readonly readActionProposals: () => Promise<z.input<typeof controlRoutes.actionProposals.output>>;

  readonly readModelInput: () => z.input<typeof controlRoutes.modelInput.output>;

  readonly readLiveOpens: () => number;
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
      [controlRoutes.tasks.path]: {
        GET: makeRouteHandler(controlRoutes.tasks, handlers.readTasks),
      },
      [controlRoutes.actionProposals.path]: {
        GET: makeRouteHandler(controlRoutes.actionProposals, handlers.readActionProposals),
      },
      [controlRoutes.modelInput.path]: {
        GET: makeRouteHandler(controlRoutes.modelInput, handlers.readModelInput),
      },
      [controlRoutes.liveOpens.path]: {
        GET: makeRouteHandler(controlRoutes.liveOpens, () => ({
          opened: handlers.readLiveOpens(),
        })),
      },
      [controlRoutes.showOnDevice.path]: {
        POST: makeRouteHandler(controlRoutes.showOnDevice, async (show) => ({
          replies: await handlers.showOnDevice(show),
        })),
      },
      [controlRoutes.layoutOnDevice.path]: {
        POST: makeRouteHandler(controlRoutes.layoutOnDevice, async (layout) => ({
          replies: await handlers.layoutOnDevice(layout),
        })),
      },
      [controlRoutes.advanceClock.path]: {
        POST: makeRouteHandler(controlRoutes.advanceClock, async (advance) => ({
          minutes: await handlers.advanceClock(advance.minutes),
        })),
      },
      [controlRoutes.useComputer.path]: {
        POST: makeRouteHandler(controlRoutes.useComputer, async (use) => ({
          replies: await handlers.useComputer(use),
        })),
      },
      [controlRoutes.modelReceived.path]: {
        POST: makeRouteHandler(controlRoutes.modelReceived, async (received) => ({
          requests: await handlers.countModelRequests(received.text),
        })),
      },
      [controlRoutes.probeRoute.path]: {
        POST: makeRouteHandler(controlRoutes.probeRoute, (probe) =>
          handlers.probeRoute(probe.route),
        ),
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
  answer: (input: z.output<Input>) => z.input<Output> | Promise<z.input<Output>>,
) {
  return async (request: Request): Promise<Response> => {
    const body: unknown = route.method === 'GET' ? {} : await request.json().catch(() => null);
    const parsed = route.input.safeParse(body);

    if (!parsed.success) {
      return Response.json({ error: parsed.error.message }, { status: 400 });
    }

    const answered = await answer(parsed.data);

    return Response.json(route.output.parse(answered));
  };
}

function answerUnknownPath(): Response {
  return new Response(null, { status: 404 });
}
