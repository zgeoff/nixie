import type { JSONObject } from '@heynixie/log';
import { z } from 'zod';

const checkerVerdict = z.object({ checker: z.object({ model: z.string() }) });

export function findCheckerModel(checks: JSONObject | null): string | null {
  const parsed = checkerVerdict.safeParse(checks);

  return parsed.success ? parsed.data.checker.model : null;
}
