import type { HttpClient } from '@wringer/http';
import { z } from 'zod';
import { controlRoutes } from './harness/control-routes';
import { pickGmailRequestsRefusal } from './pick-gmail-requests-refusal';
import { postControl } from './post-control';
import { refuseHarnessless } from './refuse-harnessless';
import { throwRefusal } from './throw-refusal';

const argsSchema = z.strictObject({ count: z.int().nonnegative() });

interface GmailRequestsContext {
  readonly target: string;
  readonly drivers: { readonly http: HttpClient };
}

// The `gmail requests` command reads how many requests the fake Gmail answered since nixie last
// started, and fails with `check-failed` when the count differs from the journey's.
export const gmailRequestsCommand = {
  path: ['gmail', 'requests'],
  summary: 'Check that the fake Gmail answered --count requests since nixie last started',
  effect: 'read',
  args: argsSchema,
  data: controlRoutes.gmailRequests.output,
  run: async (args: z.output<typeof argsSchema>, ctx: GmailRequestsContext) => {
    refuseHarnessless(ctx.target, 'gmail requests');

    const read = await postControl(ctx.drivers.http, controlRoutes.gmailRequests, {});

    throwRefusal(pickGmailRequestsRefusal(read.requests, args.count), read);

    return read;
  },
} as const;
