import type { ModelAPI, ModelAPIEndpointName } from './model-api';

interface ModelAPIEndpoint {
  readonly name: ModelAPIEndpointName;
  readonly method: 'GET' | 'POST';
  readonly path: RegExp;

  // the same paths as globs, for a sandbox broker that limits a grant to them
  readonly globs: readonly string[];
}

const modelsEndpoint: ModelAPIEndpoint = {
  name: 'models',
  method: 'GET',
  path: /^\/v1\/models(?:\/[^/]+)?$/u,
  globs: ['/v1/models', '/v1/models/*'],
};

export const modelAPIEndpoints: Readonly<Record<ModelAPI, readonly ModelAPIEndpoint[]>> = {
  'anthropic-messages': [
    { name: 'messages', method: 'POST', path: /^\/v1\/messages$/u, globs: ['/v1/messages'] },
    {
      name: 'count_tokens',
      method: 'POST',
      path: /^\/v1\/messages\/count_tokens$/u,
      globs: ['/v1/messages/count_tokens'],
    },
    modelsEndpoint,
  ],
  'openai-responses': [
    {
      name: 'responses',
      method: 'POST',
      path: /^(?:\/v1)?\/responses$/u,
      globs: ['/v1/responses', '/responses'],
    },
    modelsEndpoint,
  ],
};
