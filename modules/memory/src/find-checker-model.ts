import type { JSONObject } from '@heynixie/log';
import { z } from 'zod';

// the checks hold the checker's verdict under checker, with the model that gave it
const checkerVerdict = z.object({ checker: z.object({ model: z.string() }) });

// The model of the checker whose verdict a version's checks hold, or null when no checker ran.
export function findCheckerModel(checks: JSONObject | null): string | null {
  const parsed = checkerVerdict.safeParse(checks);

  return parsed.success ? parsed.data.checker.model : null;
}
