import type { HttpClient } from '@wringer/http';
import type { z } from 'zod';
import type { ControlRoute } from './harness/control-routes';

export async function postControl<Input extends z.ZodType, Output extends z.ZodType>(
  client: HttpClient,
  route: ControlRoute<Input, Output>,
  input: z.input<Input>,
): Promise<z.output<Output>> {
  const request =
    route.method === 'GET'
      ? ({ method: 'GET', path: route.path } as const)
      : ({ method: 'POST', path: route.path, json: input } as const);

  const response = await client.request(request);

  return route.output.parse(response.json);
}
