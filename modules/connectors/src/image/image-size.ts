export const imageSizes = ['1024x1024', '1536x1024', '1024x1536'] as const;

export type ImageSize = (typeof imageSizes)[number];

export interface ImageDimensions {
  readonly width: number;
  readonly height: number;
}

export function isImageSize(value: string): value is ImageSize {
  return imageSizes.some((size) => size === value);
}

export function formatImageSize(dimensions: ImageDimensions): string {
  return `${String(dimensions.width)}x${String(dimensions.height)}`;
}

export function parseImageSize(size: string): ImageDimensions | null {
  const parts = /^(?<width>\d+)x(?<height>\d+)$/u.exec(size);
  const groups = parts?.groups;

  return groups === undefined
    ? null
    : { width: Number(groups['width']), height: Number(groups['height']) };
}

// The size whose shape is nearest the picture's, by the ratio of the sides on a log scale, so a
// wide picture is as near a landscape as a tall one is a portrait.
export function pickNearestImageSize(dimensions: ImageDimensions): ImageSize {
  const shape = Math.log(dimensions.width / dimensions.height);
  const landscape = Math.log(1536 / 1024);

  if (shape > landscape / 2) {
    return '1536x1024';
  }

  return shape < -landscape / 2 ? '1024x1536' : '1024x1024';
}
