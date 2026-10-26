// oxlint-disable @stylistic/lines-around-comment -- turbo reads @boundaries-ignore only on the line above an import, and the import sort keeps no blank line there
import { z } from 'zod';
// @boundaries-ignore a spike imports the code it measures
import { buildCheckOptions } from '../../../guests/conversation/src/build-check-options.ts';
// @boundaries-ignore a spike imports the code it measures
import type { CheckRequest } from '../../../libs/wire/src/check-frame.ts';

// A failed reply keeps the cost its result reported, and a query that ended with no result has no
// known cost.
export type PaidReply =
  | { kind: 'answer'; output: unknown; costUSD: number; durationMs: number; apiMs: number }
  | { kind: 'failed'; reason: string; costUSD: number | null };

export interface PaidSession extends AsyncIterable<unknown> {
  close: () => void;
}

export interface PaidQueryParams {
  prompt: string;
  options: ReturnType<typeof buildCheckOptions>;
}

export interface PaidQueryDependencies {
  env: Readonly<Record<string, string | undefined>>;
  runQuery: (params: PaidQueryParams) => PaidSession;
  createDirectory: (path: string) => Promise<void>;
}

const resultSchema = z.object({
  type: z.literal('result'),
  subtype: z.string(),
  total_cost_usd: z.number(),
  duration_ms: z.number(),
  duration_api_ms: z.number(),
  structured_output: z.unknown().optional(),
});

// The check guest's own query loop drops the cost an error result reports, which the spike's budget
// needs, so the spike runs the check guest's options through this loop instead.
export async function runPaidQuery(
  request: CheckRequest,
  deps: PaidQueryDependencies,
): Promise<PaidReply> {
  const options = buildCheckOptions(request, deps.env);

  await deps.createDirectory(options.cwd ?? '');

  const session = deps.runQuery({ prompt: request.input, options });

  try {
    for await (const message of session) {
      const result = resultSchema.safeParse(message);

      if (!result.success) {
        continue;
      }

      return result.data.subtype === 'success'
        ? {
            kind: 'answer',
            output: result.data.structured_output,
            costUSD: result.data.total_cost_usd,
            durationMs: result.data.duration_ms,
            apiMs: result.data.duration_api_ms,
          }
        : { kind: 'failed', reason: result.data.subtype, costUSD: result.data.total_cost_usd };
    }

    return { kind: 'failed', reason: 'the query ended with no result', costUSD: null };
  } finally {
    session.close();
  }
}
