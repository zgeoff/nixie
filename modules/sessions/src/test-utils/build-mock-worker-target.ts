import { bindHarness, modelsConfigSchema } from '@heynixie/models';
import invariant from 'tiny-invariant';
import type { WorkerTarget } from '../worker/types';

// A worker target on a profile of the given ID and model, whose image names the ID.
export function buildMockWorkerTarget(id: string, model: string): WorkerTarget {
  const config = modelsConfigSchema.parse({
    profiles: {
      [id]: {
        harness: 'agent-sdk',
        base_url: 'https://models.example.test',
        credential: 'deployment:anthropic',
        auth_header: 'x-api-key',
        model,
        effort: 'low',
        prices: { input: 3, cache_write: 3.75, cache_write_1h: 6, cached_input: 0.3, output: 15 },
      },
    },
    roles: { conversation: id },
  });

  const profile = config.profiles[id];

  invariant(profile, 'the profile is defined');

  return {
    profile: { profile, credential: 'not-a-real-key' },
    harness: bindHarness(profile),
    image: `image-${id}`,
    size: { vcpus: 1, memoryMiB: 512, diskMiB: 1024 },
    modelGrant: { secret: id, host: 'models.example.test', env: {} },
    command: { argv: ['guest'], env: {} },
  };
}
