import { expect, test } from 'bun:test';
import { buildProbeOptions } from './build-probe-options';

test('it runs one turn of the pinned model in the target folder, with no tools and no settings files', () => {
  expect(
    buildProbeOptions({ directory: '/srv/probe', env: { CLAUDE_CONFIG_DIR: '/srv/probe' } }),
  ).toStrictEqual({
    cwd: '/srv/probe',
    model: 'claude-haiku-5-5',
    settingSources: [],
    tools: [],
    maxTurns: 1,
    settings: { autoMemoryEnabled: false, autoDreamEnabled: false },
    env: { CLAUDE_CONFIG_DIR: '/srv/probe' },
  });
});

test('it runs the model that the run names in its environment', () => {
  const options = buildProbeOptions({
    directory: '/srv/probe',
    env: { NIXIE_SDK_CONTRACT_MODEL: 'glm-test-1' },
  });

  expect(options.model).toBe('glm-test-1');
});
