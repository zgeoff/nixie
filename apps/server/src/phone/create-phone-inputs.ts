import type { CredentialAccess } from '@heynixie/credentials';
import type { PhoneProvider, PhoneSettings } from '@heynixie/phone';
import { buildTwilioPhone } from '@heynixie/phone-twilio';
import type { FakePhoneProvider } from '@heynixie/phone/fake';
import { buildFakePhoneProvider } from '@heynixie/phone/fake';
import type { WakeRulesConfig } from '@heynixie/triggers';
import invariant from 'tiny-invariant';
import type { PhoneSection } from './phone-section';

export interface PhoneInputs {
  readonly settings: PhoneSettings;
  readonly provider: PhoneProvider;

  // the in-memory provider of a test build with a harness, which a harness operation puts texts in
  readonly fake: FakePhoneProvider | null;
}

export interface PhoneInputsOptions {
  readonly credentials: CredentialAccess;
  readonly wake: WakeRulesConfig;

  // whether a test build with a harness serves the provider, so no test reaches the real one
  readonly isFaked: boolean;
  readonly now: () => number;
}

// The phone's settings and provider, or null when the config sets no `phone` section. The API key's
// secret is placed on the host, so the adapter holds none.
export function createPhoneInputs(
  section: PhoneSection | undefined,
  options: PhoneInputsOptions,
): PhoneInputs | null {
  if (section === undefined) {
    return null;
  }

  const settings: PhoneSettings = {
    number: section.number,
    pollIntervalMs: section.poll_interval,
    wake: options.wake,
  };

  if (NIXIE_TEST_BUILD && options.isFaked) {
    const fake = buildFakePhoneProvider({ now: options.now });

    return { settings, provider: fake, fake };
  }

  const ref = options.credentials.resolveCredential({
    class: 'connector',
    reference: section.twilio.credential,
    configKey: 'phone.twilio.credential',
  });

  invariant(ref !== null, 'the resolver stops at a missing connector entry');

  const origin = new URL(section.twilio.api_url).origin;

  const binding = options.credentials.store.register(ref, {
    kind: 'static',
    label: 'Twilio',
    origins: [origin],
    placement: { basic: { user: section.twilio.api_key_sid } },
  });

  return {
    settings,
    provider: buildTwilioPhone({
      fetch: options.credentials.store.fetcher(binding, [origin]),
      apiURL: section.twilio.api_url,
      accountSID: section.twilio.account_sid,
      number: section.number,
    }),
    fake: null,
  };
}
