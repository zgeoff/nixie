import { z } from 'zod';
import { parseDuration } from './parse-duration';

export function buildDurationSchema(fallback: string) {
  return z
    .string()
    .default(fallback)
    .transform((text, issues) => {
      const durationMs = parseDuration(text);

      if (durationMs === null) {
        issues.addIssue({ code: 'custom', message: 'a duration such as 500ms, 5s, 10m or 24h' });

        return z.NEVER;
      }

      return durationMs;
    });
}
