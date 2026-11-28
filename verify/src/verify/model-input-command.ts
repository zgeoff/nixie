import type { HttpClient } from '@wringer/http';
import { z } from 'zod';
import { controlRoutes } from './harness/control-routes';
import { postControl } from './post-control';
import { refuseHarnessless } from './refuse-harnessless';
import { waitForModelInput } from './wait-for-model-input';

const argsSchema = z.strictObject({
  contains: z.string().min(1),
  inSystem: z.boolean().optional(),
  waitMs: z.int().positive().optional(),
});

interface ModelInputContext {
  readonly target: string;
  readonly drivers: { readonly http: HttpClient };
}

// The `model input` command waits for the model's last input to hold --contains, and returns it.
export const modelInputCommand = {
  path: ['model', 'input'],
  summary:
    "Check that the model's last input holds the text --contains, or its system prompt with --in-system, waiting up to --wait-ms (10000 by default), and return that input; the outcome of an approved call reaches the model in it",
  effect: 'read',
  args: argsSchema,
  data: z.strictObject({ text: z.string() }),
  run: (args: z.output<typeof argsSchema>, ctx: ModelInputContext) => {
    refuseHarnessless(ctx.target, 'model input');

    return waitForModelInput(async () => {
      const input = await postControl(ctx.drivers.http, controlRoutes.modelInput, {});

      return { text: args.inSystem === true ? input.system : input.text };
    }, args);
  },
} as const;
