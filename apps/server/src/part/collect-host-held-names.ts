import { buildHostHeldName } from '@heynixie/credentials';
import type { ModelCredentials, ModelsConfig } from '@heynixie/models';
import { bindHarness } from '@heynixie/models';

// The broker names that the config's host-held profiles give: a profile whose credential the
// secrets file lacks. The sandbox host owns those secrets, so cleanup never removes them.
export function collectHostHeldNames(
  models: Pick<ModelsConfig, 'profiles'>,
  credentials: Pick<ModelCredentials, 'resolveCredential'>,
): readonly string[] {
  return Object.values(models.profiles)
    .filter(
      (profile) =>
        credentials.resolveCredential({ class: 'model', reference: profile.credential }) === null,
    )
    .map((profile) =>
      buildHostHeldName({
        profileID: profile.id,
        header: bindHarness(profile).secretHeader,
        host: new URL(profile.baseURL).hostname,
      }),
    );
}
