import type { Endpoints } from '@wringer/core';
import { match } from 'ts-pattern';
import { previewCheckout } from './preview/preview-checkout';

// On `preview`, the command runs inside the running nixie container: a compose `run` or `up` there
// would recreate the container without the preview's model route.
export function buildHostCLIArgv(
  target: string,
  endpoints: Endpoints,
  args: readonly string[],
): readonly string[] {
  return match(target)
    .with('preview', () => [
      'docker',
      'compose',
      '--file',
      `${previewCheckout}/preview/compose.yaml`,
      'exec',
      '-T',
      'nixie',
      '/app/preview/run-preview.sh',
      ...args,
    ])
    .otherwise(() => [
      process.execPath,
      getEndpoint(endpoints, 'cli'),
      ...args,
      '--config',
      getEndpoint(endpoints, 'config'),
    ]);
}

function getEndpoint(endpoints: Endpoints, name: string): string {
  const value = endpoints[name];

  if (value === undefined) {
    throw new Error(`the local harness's ready line names no ${name}`);
  }

  return value;
}
