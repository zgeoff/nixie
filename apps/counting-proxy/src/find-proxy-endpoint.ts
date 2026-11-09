import type { ModelAPI, ModelAPIEndpointName } from '@heynixie/wire';
import { findModelAPIEndpoint } from '@heynixie/wire';
import { z } from 'zod';

interface ProxyBodyRule {
  readonly schema: z.ZodType<{ readonly model: string }>;

  // what a body needs, as the refusal of one that fails the schema words it
  readonly needs: string;
}

export interface ProxyEndpoint {
  readonly name: ModelAPIEndpointName;
  readonly body: ProxyBodyRule | null;

  // a call to this endpoint costs money, so one whose reply is lost leaves the count behind
  readonly spends: boolean;
}

// the model API answers each POST endpoint only for a body that names its model
const modelBody: ProxyBodyRule = {
  schema: z.looseObject({ model: z.string().min(1) }),
  needs: 'names its model',
};

// a background response spends after its reply, which holds no usage, so the count never sees it
const responsesBody: ProxyBodyRule = {
  schema: z.looseObject({ model: z.string().min(1), background: z.literal(false).optional() }),
  needs: 'names its model and asks for no background response',
};

const proxyEndpoints: Readonly<Record<ModelAPIEndpointName, ProxyEndpoint>> = {
  messages: { name: 'messages', body: modelBody, spends: true },
  count_tokens: { name: 'count_tokens', body: modelBody, spends: false },
  responses: { name: 'responses', body: responsesBody, spends: true },
  models: { name: 'models', body: null, spends: false },
};

// a reply to any endpoint outside the API's table, such as a message batch or a stored response,
// spends without the usage the proxy reads, or names its models where the route's model check
// never looks
export function findProxyEndpoint(
  api: ModelAPI,
  method: string,
  path: string,
): ProxyEndpoint | null {
  const name = findModelAPIEndpoint(api, method, path);

  return name === null ? null : proxyEndpoints[name];
}
