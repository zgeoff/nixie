import type { z } from 'zod';
import { ControlRequestError } from './control-request-error';

// Parses a control request's JSON body, or refuses it with the usage that says what the route
// takes.
export async function parseControlBody<T>(
  request: Readonly<Pick<Request, 'json'>>,
  schema: z.ZodType<T>,
  usage: string,
): Promise<T> {
  const body: unknown = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);

  if (!parsed.success) {
    throw new ControlRequestError(400, usage);
  }
  return parsed.data;
}
