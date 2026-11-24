import type { ModelAPI, ModelAPIEndpointName } from './model-api';
import { modelAPIEndpoints } from './model-api-endpoints';

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
