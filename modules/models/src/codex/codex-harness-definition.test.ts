import { expect, test } from 'bun:test';
import { harnessCapabilities } from '@heynixie/wire';
import { bindHarness } from '../model/bind-harness';
import { buildMockCodexProfile } from '../test-utils/build-mock-codex-profile';

test('#buildGrant puts a placeholder where the CLI reads the credential', () => {
  const harness = bindHarness(buildMockCodexProfile());

  expect(
    harness.buildGrant({
      name: 'model-work-1',
      value: 'not-a-real-key',
      host: 'api.openai.example.test',
      header: 'bearer',
    }),
  ).toStrictEqual({
    secret: 'model-work-1',
    host: 'api.openai.example.test',
    env: { OPENAI_API_KEY: 'nixie-broker-placeholder' },
  });
});

test('it binds the Codex record, which speaks the OpenAI Responses API', () => {
  const harness = bindHarness(buildMockCodexProfile());

  expect(harness).toMatchObject({
    id: 'codex',
    api: 'openai-responses',
    guest: { package: 'codex', entries: { turn: 'main', check: null } },
    imageKey: 'codex',
    sizeRows: { conversation: null, systemTask: 'codexTask' },
    toolUseMetaKey: 'callId',
    toolCallWaitMs: null,
    secretHeader: 'bearer',
    contextWindow: null,
    rewritesRequests: false,
    capabilities: harnessCapabilities.codex,
    session: null,
  });
});

test.each(['kept', 'one-off'] as const)(
  '#toTurnProfile gives the guest the model, the URL and the effort for a %s session',
  (use) => {
    const harness = bindHarness(
      buildMockCodexProfile({
        model: 'gpt-test-1',
        baseURL: 'https://models.example.test',
        effort: 'high',
        credential: 'deployment:openai',
      }),
    );

    expect(harness.toTurnProfile(use)).toStrictEqual({
      harness: 'codex',
      model: 'gpt-test-1',
      baseURL: 'https://models.example.test',
      effort: 'high',
    });
  },
);
