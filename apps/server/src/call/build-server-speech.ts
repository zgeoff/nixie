import type { SpeechLayer, VoiceConfig } from '@heynixie/calls';
import type { Clock } from '@heynixie/clock';
import type { CredentialAccess } from '@heynixie/credentials';
import { MissingCredentialError } from '@heynixie/credentials';
import type { Logger } from '@heynixie/logger';
import { buildGPTLiveSpeech, defaultGPTLiveModel } from '@heynixie/speech-gpt-live';

export interface ServerSpeechOptions {
  readonly voice: VoiceConfig;
  readonly credentials: CredentialAccess;
  readonly clock: Clock;
  readonly logEvent: Logger;
}

// The provider's API, fixed in its adapter: the origin the key may reach.
const gptLiveAPIURL = 'https://api.openai.com';

// The GPT-Live adapter, when the config sets the `gpt-live` voice provider and its credential is in
// the secrets file. Without either, the server holds no speech layer, and `calls.start` answers
// SPEECH_UNAVAILABLE.
export function buildServerSpeech(options: ServerSpeechOptions): SpeechLayer | null {
  const reference = findCredential(options, options.voice);

  if (reference === null) {
    return null;
  }

  const binding = options.credentials.store.register(reference, {
    kind: 'static',
    label: 'GPT-Live',
    origins: [gptLiveAPIURL],
  });

  return buildGPTLiveSpeech({
    fetch: options.credentials.store.fetcher(binding, [gptLiveAPIURL]),
    apiURL: gptLiveAPIURL,
    model: defaultGPTLiveModel,
    clock: options.clock,
    logEvent: options.logEvent,
  });
}

function findCredential(options: ServerSpeechOptions, voice: VoiceConfig) {
  try {
    return options.credentials.resolveCredential({
      class: 'connector',
      reference: voice.credential,
      configKey: 'voice.credential',
    });
  } catch (error) {
    if (error instanceof MissingCredentialError) {
      options.logEvent('calls.speech_credential_missing', { reason: error.message }, 'warn');

      return null;
    }

    throw error;
  }
}
