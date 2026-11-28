import invariant from 'tiny-invariant';
import type { ConversationImages } from '../conversation/types';
import type { ImageSettings } from '../server/create-image-settings';
import { buildStubImageProviders } from '../test/build-stub-image-providers';
import { buildImageProviders } from './build-image-providers';

interface ImagesPartOptions {
  readonly imageSettings: ImageSettings | null;
  readonly isHarnessed: boolean;
}

// The image tools' profiles and the provider of each. The part is planned only when the config has
// an images section, which is when the settings exist. The test build answers each image call with
// a stub under a harness.
export function startImagesPart(options: ImagesPartOptions): Promise<ConversationImages> {
  const settings = options.imageSettings;

  invariant(settings !== null, 'the images part starts only with an images section');

  return Promise.resolve({
    config: settings.config,
    providers:
      NIXIE_TEST_BUILD && options.isHarnessed
        ? buildStubImageProviders(settings.config)
        : buildImageProviders(settings),
  });
}
