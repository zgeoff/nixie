import { imageLimits } from '@heynixie/contract';
import { useCallback, useState } from 'react';

export interface AttachedImage {
  readonly id: string;
  readonly file: File;
}

// Holds the scaled copies of the images attached to the message you are writing, up to the most a
// message takes, and leaves out an image that does not read or fit, with a notice that says why.
// The images are pending while any still scales, so a send waits rather than leave one behind.
export function useAttachedImages(normalizeImage: (image: File) => Promise<File>) {
  const [images, setImages] = useState<readonly AttachedImage[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [scaling, setScaling] = useState(0);

  const attach = useCallback(
    async (files: readonly File[]) => {
      const picked = files.filter((file) => isImageFile(file));

      if (picked.length === 0) {
        return;
      }

      setScaling((current) => current + 1);

      const read = await readScaledImages(picked, normalizeImage);

      setScaling((current) => current - 1);

      const fitting = read.filter((file) => file.size <= imageLimits.bytes);
      const room = imageLimits.count - images.length;

      setImages((current) => [
        ...current,
        ...fitting
          .slice(0, imageLimits.count - current.length)
          .map((file) => ({ id: crypto.randomUUID(), file })),
      ]);

      setNotice(
        pickNotice({ picked: picked.length, read: read.length, fitting: fitting.length, room }),
      );
    },
    [images.length, normalizeImage],
  );

  const remove = useCallback((id: string) => {
    setImages((current) => current.filter((image) => image.id !== id));
    setNotice(null);
  }, []);

  const clear = useCallback(() => {
    setImages([]);
    setNotice(null);
  }, []);

  return { attach, clear, images, isPending: scaling > 0, notice, remove };
}

// a HEIC photo from a phone's files can come with no type, so its name counts too
function isImageFile(file: File): boolean {
  return file.type.startsWith('image/') || /\.hei[cf]$/iu.test(file.name);
}

// the scaled copy of each image the browser could read, in the order picked
async function readScaledImages(
  picked: readonly File[],
  normalizeImage: (image: File) => Promise<File>,
): Promise<readonly File[]> {
  const results = await Promise.allSettled(picked.map((file) => normalizeImage(file)));

  return results.flatMap((result) => (result.status === 'fulfilled' ? [result.value] : []));
}

interface AttachCounts {
  readonly picked: number;
  readonly read: number;
  readonly fitting: number;
  readonly room: number;
}

function pickNotice(counts: AttachCounts): string | null {
  if (counts.read < counts.picked) {
    return 'This browser could not read an image, so it was left out.';
  }

  if (counts.fitting < counts.read) {
    return 'An image was still over 5 MB once scaled, so it was left out.';
  }

  if (counts.fitting > counts.room) {
    return `A message takes up to ${imageLimits.count} images.`;
  }

  return null;
}
