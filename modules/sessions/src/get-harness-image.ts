import invariant from 'tiny-invariant';

export function getHarnessImage(
  images: Readonly<Record<string, string>>,
  imageKey: string,
): string {
  const image = images[imageKey];

  invariant(image, `the sandbox manifest holds no ${imageKey} image`);

  return image;
}
