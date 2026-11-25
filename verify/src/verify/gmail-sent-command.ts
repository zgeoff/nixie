import type { HttpClient } from '@wringer/http';
import { z } from 'zod';
import { controlRoutes } from './harness/control-routes';
import { pickGmailSentRefusal } from './pick-gmail-sent-refusal';
import { postControl } from './post-control';
import { refuseHarnessless } from './refuse-harnessless';
import { throwRefusal } from './throw-refusal';

const argsSchema = z.strictObject({
  count: z.int().nonnegative(),
  to: z.string().min(1).optional(),
});

interface GmailSentContext {
  readonly target: string;
  readonly drivers: { readonly http: HttpClient };
}

// The `gmail sent` command reads the mails that the fake Gmail took through its send call, and fails
// with `check-failed` when their count, or the address of the only one, differs from the journey's.
export const gmailSentCommand = {
  path: ['gmail', 'sent'],
  summary: 'Check that the fake Gmail took --count sent mails, and that the only one went to --to',
  effect: 'read',
  args: argsSchema,
  data: controlRoutes.gmailSent.output,
  run: async (args: z.output<typeof argsSchema>, ctx: GmailSentContext) => {
    refuseHarnessless(ctx.target, 'gmail sent');

    const read = await postControl(ctx.drivers.http, controlRoutes.gmailSent, {});

    throwRefusal(pickGmailSentRefusal(read.sent, args), read);

    return read;
  },
} as const;
