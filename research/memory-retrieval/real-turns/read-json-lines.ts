import type { z } from 'zod';

// A line that fails its schema stops the read with its file and line number, and with no value from
// the line, because the files hold the user's own data.
export async function readJSONLines<Schema extends z.ZodType>(path: string, schema: Schema): Promise<z.output<Schema>[]> {
  const lines = (await Bun.file(path).text()).split('\n');

  return lines.flatMap((line, position) => {
    if (line.trim() === '') {
      return [];
    }

    const parsed = schema.safeParse(parseJSON(line));

    if (!parsed.success) {
      const paths = parsed.error.issues.map((issue) => issue.path.join('.') || '(line)');

      throw new Error(`${path}:${position + 1} does not match its schema at ${paths.join(', ')}`);
    }

    return [parsed.data];
  });
}

function parseJSON(line: string): unknown {
  try {
    return JSON.parse(line);
  } catch {
    return undefined;
  }
}
