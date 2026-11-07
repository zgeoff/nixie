import { imageLimits } from '@heynixie/contract';

export interface ImageFacts {
  readonly format: Bun.Image.Format;
  readonly width: number;
  readonly height: number;
  readonly bytes: number;
}

export type ImageFit =
  | { readonly kind: 'keep'; readonly mediaType: string }
  | { readonly kind: 'encode'; readonly format: 'jpeg' | 'png' };

const modelMediaTypes: ReadonlyMap<Bun.Image.Format, string> = new Map([
  ['jpeg', 'image/jpeg'],
  ['png', 'image/png'],
  ['webp', 'image/webp'],
  ['gif', 'image/gif'],
]);

// An image the model takes as it is stays byte for byte; any other is encoded again, a photo as a
// JPEG and the rest as a PNG, which keeps sharp edges and transparency.
export function pickImageFit(facts: ImageFacts, longEdge: number): ImageFit {
  const mediaType = modelMediaTypes.get(facts.format);

  const isWithinLimits =
    Math.max(facts.width, facts.height) <= longEdge && facts.bytes <= imageLimits.bytes;

  if (mediaType !== undefined && isWithinLimits) {
    return { kind: 'keep', mediaType };
  }

  return { kind: 'encode', format: facts.format === 'jpeg' ? 'jpeg' : 'png' };
}
