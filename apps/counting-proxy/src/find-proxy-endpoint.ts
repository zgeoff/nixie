import type { ModelAPI } from '@heynixie/models';
import { z } from 'zod';

interface ProxyBodyRule {
  readonly schema: z.ZodType<{ readonly model: string }>;

  // what a body needs, as the refusal of one that fails the schema words it
  readonly needs: string;
}

export interface ProxyEndpoint {
  readonly name: 'messages' | 'count_tokens' | 'responses' | 'models';
  readonly method: 'GET' | 'POST';
  readonly path: RegExp;
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

const modelsEndpoint: ProxyEndpoint = {
  name: 'models',
  method: 'GET',
  path: /^\/v1\/models(?:\/[^/]+)?$/u,
  body: null,
  spends: false,
};

// a reply to any other endpoint, such as a message batch or a stored response, spends without the
// usage the proxy reads, or names its models where the route's model check never looks
const proxyEndpoints: Readonly<Record<ModelAPI, readonly ProxyEndpoint[]>> = {
  'anthropic-messages': [
    {
      name: 'messages',
      method: 'POST',
      path: /^\/v1\/messages$/u,
      body: modelBody,
      spends: true,
    },
    {
      name: 'count_tokens',
      method: 'POST',
      path: /^\/v1\/messages\/count_tokens$/u,
      body: modelBody,
      spends: false,
    },
    modelsEndpoint,
  ],
  'openai-responses': [
    {
      name: 'responses',
      method: 'POST',
      path: /^\/v1\/responses$/u,
      body: responsesBody,
      spends: true,
    },
    modelsEndpoint,
  ],
};

export function findProxyEndpoint(
  api: ModelAPI,
  method: string,
  path: string,
): ProxyEndpoint | null {
  return (
    proxyEndpoints[api].find(
      (endpoint) => endpoint.method === method && endpoint.path.test(path),
    ) ?? null
  );
}
