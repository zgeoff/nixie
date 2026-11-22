const thumbnailLongEdge = 512;
const thumbnailQuality = 80;

// A 512 pixel WebP of the stored PNG. The server makes one on each read and keeps none, so a forget
// leaves no copy of the picture.
export async function createThumbnail(png: Uint8Array): Promise<Uint8Array<ArrayBuffer>> {
  const bytes = await new Bun.Image(png)
    .resize(thumbnailLongEdge, thumbnailLongEdge, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: thumbnailQuality })
    .bytes();

  return new Uint8Array(bytes);
}
