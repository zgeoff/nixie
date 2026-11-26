import type { TestModelGateway } from '@heynixie/model-gateway/test-utils';
import type { ScriptedModel } from '@heynixie/testing';
import invariant from 'tiny-invariant';
import { z } from 'zod';

const errorFields = z.object({
  type: z.string(),
  counter: z.string().optional(),
  route: z.string().optional(),
  provider: z.string().optional(),
});

const errorSchema = z.object({ error: errorFields });
const dayCount = z.object({ tripped: z.boolean() });
const providersSchema = z.record(z.string(), z.object({ day: dayCount }));
const routesSchema = z.record(z.string(), z.object({ provider: z.string(), day: dayCount }));
const statusSchema = z.object({ providers: providersSchema, routes: routesSchema });

export interface RouteProbe {
  readonly status: number;
  readonly error: z.output<typeof errorSchema>['error'] | null;
}

// The reply that the model gives costs 2 dollars, more than the day limit of the provider that the
// route `second` is on, so the next request on the route is refused. A route held by its own limit
// or its provider's gets no reply queued.
export async function sendSpendProbe(
  gateway: TestModelGateway | null,
  model: ScriptedModel,
  route: string,
): Promise<RouteProbe> {
  invariant(gateway, 'probe-route needs a start with NIXIE_VERIFY_SPEND=1');

  const headers = { authorization: `Bearer ${gateway.control.token}` };
  const sandboxURL = `${gateway.control.url}/sandboxes/verify-probe`;

  const registered = await globalThis.fetch(sandboxURL, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ limit: null }),
  });

  invariant(registered.ok, 'the gateway registers the probe sandbox');

  const statusResponse = await globalThis.fetch(`${gateway.control.url}/status`, { headers });
  const statusBody: unknown = await statusResponse.json();

  const counts = statusSchema.parse(statusBody);
  const provider = counts.routes[route]?.provider ?? '';

  const isStopped =
    counts.routes[route]?.day.tripped === true || counts.providers[provider]?.day.tripped === true;

  if (!isStopped) {
    model.addReplies({ text: 'probe', usage: { input_tokens: 1_000_000, output_tokens: 250_000 } });
  }

  const response = await globalThis.fetch(`${gateway.url}/verify-probe/${route}/v1/messages`, {
    method: 'POST',
    body: JSON.stringify({ model: 'claude-test-1', messages: [] }),
  });

  const answer: unknown = await response.json().catch(() => null);

  const parsed = errorSchema.safeParse(answer);

  return { status: response.status, error: parsed.success ? parsed.data.error : null };
}
