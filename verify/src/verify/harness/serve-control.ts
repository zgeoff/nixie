import type { z } from 'zod';
import type { McpApprovalLabel } from './approve-held-mcp';
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

  readonly approveHeldMcp: (label: McpApprovalLabel) => Promise<number>;
  readonly approveHeldMandate: () => Promise<number>;

  // adds the site to the directory at read, and returns the short ID of its entry
  readonly trustSite: (domain: string) => Promise<string>;

  readonly runCallStep: (
    call: z.output<typeof controlRoutes.callStep.input>,
  ) => Promise<z.input<typeof controlRoutes.callStep.output>>;
  readonly deliverMail: (mail: z.output<typeof controlRoutes.deliverMail.input>) => Promise<void>;

  readonly deliverGmail: (mail: z.output<typeof controlRoutes.deliverGmail.input>) => void;

  readonly setSessionState: (
    state: z.output<typeof controlRoutes.setSessionState.input>['state'],
  ) => number;

  readonly readGmailRequests: () => z.input<typeof controlRoutes.gmailRequests.output>;

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

  readonly readGmailSent: () => z.input<typeof controlRoutes.gmailSent.output>;

  readonly readCalendarWrites: () => z.input<typeof controlRoutes.calendarWrites.output>;

  readonly readDriveFiles: () => z.input<typeof controlRoutes.driveFiles.output>;
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
      [controlRoutes.gmailSent.path]: {
        GET: makeRouteHandler(controlRoutes.gmailSent, handlers.readGmailSent),
      },
      [controlRoutes.calendarWrites.path]: {
        GET: makeRouteHandler(controlRoutes.calendarWrites, handlers.readCalendarWrites),
      },
      [controlRoutes.driveFiles.path]: {
        GET: makeRouteHandler(controlRoutes.driveFiles, handlers.readDriveFiles),
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
      [controlRoutes.approveHeldMcp.path]: {
        POST: makeRouteHandler(controlRoutes.approveHeldMcp, async (approval) => ({
          approved: await handlers.approveHeldMcp(approval.label),
        })),
      },
      [controlRoutes.approveHeldMandate.path]: {
        POST: makeRouteHandler(controlRoutes.approveHeldMandate, async () => ({
          approved: await handlers.approveHeldMandate(),
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
      [controlRoutes.deliverMail.path]: {
        POST: makeRouteHandler(controlRoutes.deliverMail, async (mail) => {
          await handlers.deliverMail(mail);

          return { delivered: true as const };
        }),
      },
      [controlRoutes.deliverGmail.path]: {
        POST: makeRouteHandler(controlRoutes.deliverGmail, (mail) => {
          handlers.deliverGmail(mail);

          return { delivered: true as const };
        }),
      },
      [controlRoutes.setSessionState.path]: {
        POST: makeRouteHandler(controlRoutes.setSessionState, (set) => ({
          sessions: handlers.setSessionState(set.state),
        })),
      },
      [controlRoutes.gmailRequests.path]: {
        GET: makeRouteHandler(controlRoutes.gmailRequests, () => handlers.readGmailRequests()),
      },
      [controlRoutes.trustSite.path]: {
        POST: makeRouteHandler(controlRoutes.trustSite, async (site) => ({
          place: await handlers.trustSite(site.domain),
        })),
      },
      [controlRoutes.useComputer.path]: {
        POST: makeRouteHandler(controlRoutes.useComputer, async (use) => ({
          replies: await handlers.useComputer(use),
        })),
      },
      [controlRoutes.callStep.path]: {
        POST: makeRouteHandler(controlRoutes.callStep, (call) => handlers.runCallStep(call)),
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
