import type { Tools } from './start-tools';
import type { ServerParts } from './types';

type ImageParts = Pick<ServerParts, 'images' | 'log' | 'state'> & {
  readonly tools: Pick<Tools, 'adapter'>;
};

// Adds each image in the sandbox manifest to the sandbox runtime, which pulls one image at a time.
export async function registerSandboxImages(parts: ImageParts): Promise<void> {
  for (const image of Object.values(parts.images)) {
    // oxlint-disable-next-line no-await-in-loop -- impd pulls one image at a time
    await parts.tools.adapter.addImage(image);
    parts.log('image.added', { name: image.name });
  }
  parts.state.update({ areImagesAdded: true });
}
