import type { Tools } from './tools';
import type { ServerParts } from './types';

type ImageParts = Pick<ServerParts, 'images' | 'log' | 'state'> & {
  readonly tools: Pick<Tools, 'adapter'>;
};

export async function registerSandboxImages(parts: ImageParts): Promise<void> {
  // The sandbox runtime pulls one image at a time, so the images are added one after another.
  for (const image of Object.values(parts.images)) {
    try {
      await parts.tools.adapter.addImage(image);
    } catch (error) {
      parts.state.update({
        images: { isReady: false, reason: `impd did not add the image ${image.name}` },
      });

      throw error;
    }

    parts.log('image.added', { name: image.name });
  }

  parts.state.update({ images: { isReady: true, reason: null } });
}
