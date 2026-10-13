import type { ZodType } from 'zod';
import { ControlRequestError } from './control-request-error';

// Parses a control request's JSON body, or refuses it with the usage that says what the route
// takes.
// oxlint-disable-next-line typescript/prefer-readonly-parameter-types -- a Request has no readonly form
export async function parseControlBody<T>(request: Request, schema: ZodType<T>, usage: string) {
  const body: unknown = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);

  if (!parsed.success) {
    throw new ControlRequestError(400, usage);
  }
  return parsed.data;
}
