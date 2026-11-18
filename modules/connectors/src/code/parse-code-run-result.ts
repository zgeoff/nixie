import { z } from 'zod';

const streamSchema = z.object({ file: z.string().nullable() });
const writtenSchema = z.object({ file: z.string(), path: z.string() });

const resultSchema = z.object({
  result: z.object({
    stdout: streamSchema,
    stderr: streamSchema,
    files: z.array(writtenSchema),
  }),
});

export type CodeRunResult = z.infer<typeof resultSchema>['result'];

// The files and kept streams that a code run's result record names, or undefined for a record that
// is not a code run's result.
export function parseCodeRunResult(fields: unknown): CodeRunResult | undefined {
  return resultSchema.safeParse(fields).data?.result;
}
