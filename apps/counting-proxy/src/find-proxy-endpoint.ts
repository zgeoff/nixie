import { z } from 'zod';

// the model API answers both POST endpoints only for a body that names its model
const modelRequestSchema = z.looseObject({ model: z.string().min(1) });

export interface ProxyEndpoint {
  readonly name: 'messages' | 'count_tokens' | 'models';
  readonly method: 'GET' | 'POST';
  readonly path: RegExp;
  readonly body: typeof modelRequestSchema | null;
}

// a reply to any other endpoint, such as a message batch, spends without the usage the proxy reads,
// or names its models where the route's model check never looks
const proxyEndpoints: readonly ProxyEndpoint[] = [
  { name: 'messages', method: 'POST', path: /^\/v1\/messages$/u, body: modelRequestSchema },
  {
    name: 'count_tokens',
    method: 'POST',
    path: /^\/v1\/messages\/count_tokens$/u,
    body: modelRequestSchema,
  },
  { name: 'models', method: 'GET', path: /^\/v1\/models(?:\/[^/]+)?$/u, body: null },
];

export function findProxyEndpoint(method: string, path: string): ProxyEndpoint | null {
  return (
    proxyEndpoints.find((endpoint) => endpoint.method === method && endpoint.path.test(path)) ??
    null
  );
}
