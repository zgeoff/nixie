import { z } from 'zod';
import { wakeEventSchema } from '../record/wake-event-schema';

// The `coding.start` input of a coding task, for a start and a join alike. A strict object, so it
// refuses `report`, `limits`, `reportShape`, `persona`, `memory` and `tools`. The plan checks that
// the input holds exactly one of `repo` and `session`.
export function buildCodingStartSchema() {
  return z.strictObject({
    name: z.string(),
    brief: z.string(),
    repo: z.object({ url: z.string(), ref: z.string() }).exactOptional(),
    target: z.string().exactOptional(),
    agent: z.string().exactOptional(),
    model: z.string().exactOptional(),
    session: z.string().exactOptional(),
    wake: z.array(wakeEventSchema).exactOptional(),
  });
}

export type CodingStartInput = z.infer<ReturnType<typeof buildCodingStartSchema>>;
