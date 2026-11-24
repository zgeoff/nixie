import { z } from 'zod';

const heartbeatText = z.string().regex(/^\d+$/u).transform(Number);

export async function readHeartbeat(path: string): Promise<number | null> {
  const file = Bun.file(path);

  if (!(await file.exists())) {
    return null;
  }

  const text = await file.text();

  const parsed = heartbeatText.safeParse(text.trim());

  return parsed.success ? parsed.data : null;
}
