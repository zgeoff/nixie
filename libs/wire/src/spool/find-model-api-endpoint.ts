import type { ModelAPI, ModelAPIEndpointName } from './model-api';

interface ModelAPIEndpoint {
  readonly name: ModelAPIEndpointName;
  readonly method: 'GET' | 'POST';
  readonly path: RegExp;
}

const modelsEndpoint: ModelAPIEndpoint = {
  name: 'models',
  method: 'GET',
  path: /^\/v1\/models(?:\/[^/]+)?$/u,
};

const modelAPIEndpoints: Readonly<Record<ModelAPI, readonly ModelAPIEndpoint[]>> = {
  'anthropic-messages': [
    { name: 'messages', method: 'POST', path: /^\/v1\/messages$/u },
    { name: 'count_tokens', method: 'POST', path: /^\/v1\/messages\/count_tokens$/u },
    modelsEndpoint,
  ],
  'openai-responses': [
    { name: 'responses', method: 'POST', path: /^\/v1\/responses$/u },
    modelsEndpoint,
  ],
};

export function findModelAPIEndpoint(
  api: ModelAPI,
  method: string,
  path: string,
): ModelAPIEndpointName | null {
  return (
    modelAPIEndpoints[api].find(
      (endpoint) => endpoint.method === method && endpoint.path.test(path),
    )?.name ?? null
  );
}
