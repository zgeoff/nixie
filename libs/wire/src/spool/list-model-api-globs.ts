import type { ModelAPI } from './model-api';
import { modelAPIEndpoints } from './model-api-endpoints';

// The paths of an API's endpoints as globs under a base path such as `/anthropic`.
export function listModelAPIGlobs(api: ModelAPI, basePath: string): readonly string[] {
  const prefix = basePath.replace(/\/+$/u, '');

  return [...new Set(modelAPIEndpoints[api].flatMap((endpoint) => endpoint.globs))].map(
    (glob) => `${prefix}${glob}`,
  );
}
