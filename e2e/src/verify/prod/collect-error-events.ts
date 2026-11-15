import { z } from 'zod';

const logLineSchema = z.looseObject({ event: z.string(), level: z.string().optional() });

// nixie logs one JSON object per line, and leaves `level` out of an info line. A line that is no
// such object, such as a runtime's own stack trace, counts as an error too.
export function collectErrorEvents(logText: string): readonly string[] {
  return logText
    .split('\n')
    .filter((line) => line.trim() !== '')
    .flatMap((line) => {
      const parsed = logLineSchema.safeParse(parseJSON(line));

      if (!parsed.success) {
        return ['unparsed line'];
      }

      return parsed.data.level === 'error' ? [parsed.data.event] : [];
    });
}

function parseJSON(line: string): unknown {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}
